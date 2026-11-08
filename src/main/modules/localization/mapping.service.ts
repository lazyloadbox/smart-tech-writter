import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { getDatabase, getSetting, setSetting, GLOSSARY_VERSION_KEY } from '../storage/database';
import {
  classifyEntryKind,
  normalizeEn,
  parseDoNotUse,
  serializeDoNotUse,
} from '../glossary/normalize';
import { expandAliases } from '../glossary/aliases';
import { buildImportPlan, type ExistingGlossaryEntry } from '../glossary/deduper';
import type { GlossaryService } from '../glossary/glossary.service';
import type { LocalizeLanguage } from '../../../shared/types/document.types';
import type {
  ConflictStrategy,
  GlossaryBackupInfo,
  GlossaryBatchUndoResult,
  GlossaryEntryKind,
  GlossaryImportBatchInfo,
  GlossaryImportMode,
  GlossaryOrigin,
  GlossaryRestoreResult,
  ImportPlan,
  MappingImportResult,
  MappingListQuery,
  MappingListResult,
  MappingStats,
  ParsedGlossaryRow,
  TranslationMapping,
} from '../../../shared/types/mapping.types';

/** Max glossary entries injected into a single AI prompt while P2a is pending. */
const MAX_PROMPT_ENTRIES = 500;

interface MappingRow {
  id: string;
  seq_no: number | null;
  en: string;
  zh_cn: string;
  zh_tw: string;
  do_not_use?: string | null;
  en_key: string;
  kind: GlossaryEntryKind;
  origin: GlossaryOrigin;
  batch_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** Existing row minimal shape used by the import planner. */
interface ExistingRow {
  id: string;
  en_key: string;
  en: string;
  zh_cn: string;
  zh_tw: string;
  do_not_use?: string | null;
  origin: GlossaryOrigin;
}

/** Per-batch snapshot captured at import time so an undo is exact (P4-2). */
interface BatchSnapshot {
  /** Ids of the rows this batch inserted. */
  insertedIds: string[];
  /** Pre-import values of the rows this batch updated. */
  previous: MappingRow[];
}

/**
 * Parse the stored JSON array of forbidden wordings (tolerant of legacy text).
 * Re-exported from `glossary/normalize` so callers keep one import site.
 */
export { parseDoNotUse, serializeDoNotUse };

function toMapping(r: MappingRow): TranslationMapping {
  return {
    id: r.id,
    seqNo: r.seq_no ?? undefined,
    en: r.en,
    zhCN: r.zh_cn,
    zhTW: r.zh_tw,
    doNotUse: parseDoNotUse(r.do_not_use),
    enKey: r.en_key,
    kind: r.kind,
    origin: r.origin,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toExistingEntry(r: ExistingRow): ExistingGlossaryEntry {
  return {
    id: r.id,
    enKey: r.en_key,
    en: r.en,
    zhCN: r.zh_cn,
    zhTW: r.zh_tw,
    origin: r.origin,
    doNotUse: parseDoNotUse(r.do_not_use),
  };
}

/**
 * Translation mapping (glossary) service.
 *
 * Persists three-column glossary rows (English → 简体中文 → 繁體中文) in the
 * local SQLite database and exposes CRUD, paginated listing, plan-based bulk
 * import (append / replace with conflict strategy and backup) and the prompt
 * block used during localization.
 */
export class MappingService {
  /**
   * Optional matching engine (P2a). When present, `getMappingContext()` only
   * injects entries that actually occur in the source text, and every write
   * invalidates the cached index.
   */
  private glossary: GlossaryService | null = null;

  /** Attach the glossary matching service (called from `main/index.ts`). */
  setGlossaryService(glossary: GlossaryService): void {
    this.glossary = glossary;
  }

  /** Paginated + filtered glossary list (server-side paging for large tables). */
  listMappings(query: MappingListQuery = {}): MappingListResult {
    try {
      const db = getDatabase();
      const where: string[] = [];
      const params: (string | number)[] = [];
      const term = query.search?.trim();
      if (term) {
        where.push('(en LIKE ? OR zh_cn LIKE ? OR zh_tw LIKE ?)');
        const like = `%${term}%`;
        params.push(like, like, like);
      }
      if (query.kind) {
        where.push('kind = ?');
        params.push(query.kind);
      }
      const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

      const totalRow = db
        .prepare(`SELECT COUNT(*) AS c FROM translation_mappings${whereSql}`)
        .get(...params) as { c: number };

      const limit = Math.min(Math.max(query.limit ?? 20, 1), 500);
      const offset = Math.max(query.offset ?? 0, 0);
      const rows = db
        .prepare(
          `SELECT * FROM translation_mappings${whereSql}
           ORDER BY seq_no IS NULL, seq_no, en COLLATE NOCASE ASC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset) as MappingRow[];

      return { items: rows.map(toMapping), total: totalRow.c };
    } catch (err) {
      log.error('[Mapping] listMappings failed:', err);
      return { items: [], total: 0 };
    }
  }

  /** All glossary rows (used by the import planner and the Excel export). */
  listAllMappings(): TranslationMapping[] {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          `SELECT * FROM translation_mappings
           ORDER BY seq_no IS NULL, seq_no, en COLLATE NOCASE ASC`
        )
        .all() as MappingRow[];
      return rows.map(toMapping);
    } catch (err) {
      log.error('[Mapping] listAllMappings failed:', err);
      return [];
    }
  }

  /**
   * Add a single mapping. English is required; zh-CN / zh-TW may be empty
   * (term-only entries). Returns null when the normalized English key exists.
   */
  addMapping(
    en: string,
    zhCN: string,
    zhTW: string,
    kind?: GlossaryEntryKind,
    doNotUse?: string[]
  ): TranslationMapping | null {
    const enText = en.trim();
    if (!enText) return null;
    const enKey = normalizeEn(enText);
    if (!enKey) return null;
    try {
      const db = getDatabase();
      const existing = db
        .prepare('SELECT id FROM translation_mappings WHERE en_key = ?')
        .get(enKey) as { id: string } | undefined;
      if (existing) return null;
      const now = new Date().toISOString();
      const id = uuidv4();
      const entryKind = kind ?? classifyEntryKind(enText);
      db.prepare(
        `INSERT INTO translation_mappings
           (id, seq_no, en, zh_cn, zh_tw, do_not_use, en_key, kind, origin, batch_id, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?)`
      ).run(
        id,
        enText,
        zhCN.trim(),
        zhTW.trim(),
        serializeDoNotUse(doNotUse),
        enKey,
        entryKind,
        now,
        now
      );
      this.writeAliases(id, enText, zhCN.trim(), zhTW.trim());
      this.bumpGlossaryVersion();
      this.invalidateGlossary(id);
      return {
        id,
        en: enText,
        zhCN: zhCN.trim(),
        zhTW: zhTW.trim(),
        doNotUse: (doNotUse ?? []).map((s) => s.trim()).filter(Boolean),
        enKey,
        kind: entryKind,
        origin: 'manual',
        createdAt: now,
        updatedAt: now,
      };
    } catch (err) {
      log.error('[Mapping] addMapping failed:', err);
      return null;
    }
  }

  /** Update an existing mapping (English required, Chinese columns optional). */
  updateMapping(
    id: string,
    en: string,
    zhCN: string,
    zhTW: string,
    kind?: GlossaryEntryKind,
    doNotUse?: string[]
  ): TranslationMapping | null {
    const enText = en.trim();
    if (!enText) return null;
    const enKey = normalizeEn(enText);
    if (!enKey) return null;
    try {
      const db = getDatabase();
      const clash = db
        .prepare('SELECT id FROM translation_mappings WHERE en_key = ? AND id <> ?')
        .get(enKey, id) as { id: string } | undefined;
      if (clash) return null;
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `UPDATE translation_mappings
             SET en = ?, zh_cn = ?, zh_tw = ?, do_not_use = ?, en_key = ?, kind = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          enText,
          zhCN.trim(),
          zhTW.trim(),
          serializeDoNotUse(doNotUse),
          enKey,
          kind ?? classifyEntryKind(enText),
          now,
          id
        );
      if (result.changes === 0) return null;
      const row = db.prepare('SELECT * FROM translation_mappings WHERE id = ?').get(id) as
        | MappingRow
        | undefined;
      this.writeAliases(id, enText, zhCN.trim(), zhTW.trim());
      this.bumpGlossaryVersion();
      this.invalidateGlossary(id);
      return row ? toMapping(row) : null;
    } catch (err) {
      log.error('[Mapping] updateMapping failed:', err);
      return null;
    }
  }

  /** Delete a mapping by id. */
  deleteMapping(id: string): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM translation_mappings WHERE id = ?').run(id);
      db.prepare('DELETE FROM glossary_aliases WHERE entry_id = ?').run(id);
      this.bumpGlossaryVersion();
      this.invalidateGlossary(id);
    } catch (err) {
      log.error('[Mapping] deleteMapping failed:', err);
    }
  }

  /**
   * Compute the import plan for parsed rows without applying it. The preview
   * dialog calls this whenever the mode / strategy / keepDefaults change.
   */
  planImport(
    rows: ParsedGlossaryRow[],
    mode: GlossaryImportMode,
    strategy: ConflictStrategy,
    keepDefaults: boolean
  ) {
    const db = getDatabase();
    const all = db
      .prepare('SELECT id, en_key, en, zh_cn, zh_tw, do_not_use, origin FROM translation_mappings')
      .all() as ExistingRow[];
    const existing =
      mode === 'replace' ? (keepDefaults ? all.filter((r) => r.origin === 'default') : []) : all;
    return buildImportPlan({
      rows,
      existing: existing.map(toExistingEntry),
      existingTotal: all.length,
      mode,
      strategy,
      keepDefaults,
    });
  }

  /**
   * Apply a parsed import transactionally.
   *
   * - `append` keeps existing rows and inserts/updates by conflict strategy.
   * - `replace` backs up the current glossary, clears it (optionally keeping
   *   built-in defaults) and inserts the file rows.
   *
   * Any failure rolls the transaction back so the glossary stays untouched.
   */
  applyImport(
    fileName: string,
    rows: ParsedGlossaryRow[],
    mode: GlossaryImportMode,
    strategy: ConflictStrategy,
    keepDefaults: boolean
  ): MappingImportResult {
    const startedAt = Date.now();
    const { plan, operations } = this.planImport(rows, mode, strategy, keepDefaults);
    const db = getDatabase();
    const batchId = uuidv4();
    const now = new Date().toISOString();
    let backupPath: string | undefined;
    /** Snapshot of the pre-import state, used to make batch undo exact (P4-2). */
    const snapshot: BatchSnapshot = { insertedIds: [], previous: [] };

    const apply = db.transaction(() => {
      if (mode === 'replace') {
        backupPath = this.backupGlossary() ?? undefined;
        if (keepDefaults) {
          db.prepare(`DELETE FROM translation_mappings WHERE origin <> 'default'`).run();
        } else {
          db.prepare('DELETE FROM translation_mappings').run();
        }
        // Alias rows of deleted entries must not linger in the index.
        db.prepare(
          'DELETE FROM glossary_aliases WHERE entry_id NOT IN (SELECT id FROM translation_mappings)'
        ).run();
      }

      const insert = db.prepare(
        `INSERT INTO translation_mappings
           (id, seq_no, en, zh_cn, zh_tw, do_not_use, en_key, kind, origin, batch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?, ?)`
      );
      for (const op of operations.inserts) {
        const id = uuidv4();
        insert.run(
          id,
          op.seqNo ?? null,
          op.en,
          op.zhCN,
          op.zhTW,
          serializeDoNotUse(op.doNotUse),
          op.enKey,
          op.kind,
          batchId,
          now,
          now
        );
        snapshot.insertedIds.push(id);
        this.writeAliases(id, op.en, op.zhCN, op.zhTW);
      }

      const update = db.prepare(
        `UPDATE translation_mappings
           SET zh_cn = ?, zh_tw = ?, do_not_use = ?, kind = ?, origin = 'import', batch_id = ?, updated_at = ?
         WHERE id = ?`
      );
      const selectRow = db.prepare('SELECT * FROM translation_mappings WHERE id = ?');
      for (const op of operations.updates) {
        const before = selectRow.get(op.id) as MappingRow | undefined;
        if (before) snapshot.previous.push(before);
        update.run(
          op.zhCN,
          op.zhTW,
          serializeDoNotUse(op.doNotUse),
          op.kind,
          batchId,
          now,
          op.id
        );
        if (before) {
          this.writeAliases(op.id, before.en, op.zhCN, op.zhTW);
        }
      }

      db.prepare(
        `INSERT INTO glossary_import_batches
           (id, file_name, mode, stats_json, backup_path, snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        batchId,
        fileName,
        mode,
        JSON.stringify(plan),
        backupPath ?? null,
        JSON.stringify(snapshot),
        now
      );
    });

    apply();
    this.bumpGlossaryVersion();
    this.invalidateGlossary();
    // Re-encode vectors for the changed table in the background (P2b). No-op
    // when the semantic model is unavailable.
    void this.glossary?.refreshEmbeddings().catch((): void => undefined);

    const result: MappingImportResult = {
      ...plan,
      batchId,
      backupPath,
      durationMs: Date.now() - startedAt,
    };
    log.info('[Mapping] import applied', {
      fileName,
      mode,
      inserted: plan.toInsert,
      updated: plan.toUpdate,
      deleted: plan.toDelete,
      skipped: plan.skipped,
    });
    return result;
  }

  // ── Backups (P4-1) ──────────────────────────────────────────────────────

  /** Directory holding glossary backups. */
  private get backupDir(): string {
    return path.join(app.getPath('userData'), 'backups');
  }

  /** List the glossary backup files, newest first. */
  listBackups(): GlossaryBackupInfo[] {
    try {
      const dir = this.backupDir;
      if (!fs.existsSync(dir)) return [];
      const items: GlossaryBackupInfo[] = [];
      for (const name of fs.readdirSync(dir)) {
        if (!/^glossary-.*\.json$/.test(name)) continue;
        const full = path.join(dir, name);
        try {
          const stat = fs.statSync(full);
          const payload = JSON.parse(fs.readFileSync(full, 'utf-8')) as {
            createdAt?: string;
            rows?: unknown[];
          };
          items.push({
            fileName: name,
            path: full,
            createdAt: payload.createdAt ?? stat.mtime.toISOString(),
            rows: Array.isArray(payload.rows) ? payload.rows.length : 0,
            size: stat.size,
          });
        } catch (err) {
          log.warn('[Mapping] unreadable backup skipped', { file: name, error: String(err) });
        }
      }
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      log.error('[Mapping] listBackups failed:', err);
      return [];
    }
  }

  /**
   * Restore a glossary backup. The current table is backed up first, so the
   * restore itself can be undone. Only files inside the backup directory that
   * match the expected naming pattern are accepted (no caller-supplied paths).
   */
  restoreBackup(fileName: string): GlossaryRestoreResult {
    if (!/^glossary-.*\.json$/.test(fileName)) {
      throw new Error('Invalid backup file name.');
    }
    const full = path.join(this.backupDir, fileName);
    if (path.dirname(full) !== this.backupDir || !fs.existsSync(full)) {
      throw new Error('The selected backup file no longer exists.');
    }
    const payload = JSON.parse(fs.readFileSync(full, 'utf-8')) as {
      rows?: {
        seqNo?: number | null;
        en?: string;
        zhCN?: string;
        zhTW?: string;
        doNotUse?: string[];
        kind?: GlossaryEntryKind;
        origin?: GlossaryOrigin;
      }[];
    };
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const backupPath = this.backupGlossary() ?? undefined;
    const db = getDatabase();
    const now = new Date().toISOString();
    let restored = 0;

    const apply = db.transaction(() => {
      db.prepare('DELETE FROM translation_mappings').run();
      db.prepare('DELETE FROM glossary_aliases').run();
      const insert = db.prepare(
        `INSERT OR REPLACE INTO translation_mappings
           (id, seq_no, en, zh_cn, zh_tw, do_not_use, en_key, kind, origin, batch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      );
      for (const row of rows) {
        const en = (row.en ?? '').trim();
        const enKey = normalizeEn(en);
        if (!enKey) continue;
        const id = uuidv4();
        insert.run(
          id,
          row.seqNo ?? null,
          en,
          row.zhCN ?? '',
          row.zhTW ?? '',
          serializeDoNotUse(row.doNotUse),
          enKey,
          row.kind ?? classifyEntryKind(en),
          row.origin ?? 'import',
          now,
          now
        );
        this.writeAliases(id, en, row.zhCN ?? '', row.zhTW ?? '');
        restored++;
      }
    });
    apply();
    this.bumpGlossaryVersion();
    this.invalidateGlossary();
    void this.glossary?.refreshEmbeddings().catch((): void => undefined);
    log.info('[Mapping] backup restored', { file: fileName, rows: restored });
    return { restored, backupPath };
  }

  // ── Import batches (P4-2) ───────────────────────────────────────────────

  /** List applied import batches, newest first. */
  listBatches(limit = 20): GlossaryImportBatchInfo[] {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          `SELECT id, file_name, mode, stats_json, backup_path, undone_at, created_at
           FROM glossary_import_batches ORDER BY created_at DESC LIMIT ?`
        )
        .all(Math.min(Math.max(limit, 1), 200)) as {
        id: string;
        file_name: string;
        mode: GlossaryImportMode;
        stats_json: string;
        backup_path: string | null;
        undone_at: string | null;
        created_at: string;
      }[];
      return rows.map((row) => {
        let stats: ImportPlan | null = null;
        try {
          stats = JSON.parse(row.stats_json) as ImportPlan;
        } catch {
          stats = null;
        }
        return {
          id: row.id,
          fileName: row.file_name,
          mode: row.mode,
          createdAt: row.created_at,
          stats,
          backupPath: row.backup_path ?? undefined,
          undoable: !row.undone_at,
          undoneAt: row.undone_at ?? undefined,
        };
      });
    } catch (err) {
      log.error('[Mapping] listBatches failed:', err);
      return [];
    }
  }

  /**
   * Undo one applied import batch.
   *
   * - Rows the batch inserted are deleted.
   * - Rows the batch updated are restored to the values captured at import time.
   * - `replace` batches are restored from their backup file.
   */
  undoBatch(batchId: string): GlossaryBatchUndoResult {
    const db = getDatabase();
    const batch = db
      .prepare(
        `SELECT id, mode, backup_path, snapshot_json, undone_at FROM glossary_import_batches WHERE id = ?`
      )
      .get(batchId) as
      | {
          id: string;
          mode: GlossaryImportMode;
          backup_path: string | null;
          snapshot_json: string | null;
          undone_at: string | null;
        }
      | undefined;
    if (!batch) throw new Error('The selected import batch no longer exists.');
    if (batch.undone_at) throw new Error('This import batch has already been undone.');

    // A replace import wiped the previous table — restore from its backup.
    if (batch.mode === 'replace' && batch.backup_path) {
      const fileName = path.basename(batch.backup_path);
      const result = this.restoreBackup(fileName);
      db.prepare('UPDATE glossary_import_batches SET undone_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        batchId
      );
      return { batchId, removed: 0, restored: result.restored };
    }

    let snapshot: BatchSnapshot = { insertedIds: [], previous: [] };
    try {
      snapshot = JSON.parse(batch.snapshot_json ?? '{"insertedIds":[],"previous":[]}');
    } catch {
      // Legacy batches (pre-P4) have no snapshot; nothing can be restored.
    }
    const now = new Date().toISOString();
    let removed = 0;
    let restored = 0;

    const apply = db.transaction(() => {
      // Only touch rows this batch still owns: a later import that updated the
      // same entry must not be clobbered by undoing an older batch.
      const del = db.prepare(
        'DELETE FROM translation_mappings WHERE id = ? AND (batch_id = ? OR batch_id IS NULL)'
      );
      for (const id of snapshot.insertedIds ?? []) {
        const result = del.run(id, batchId);
        if (result.changes > 0) removed++;
        db.prepare('DELETE FROM glossary_aliases WHERE entry_id = ?').run(id);
      }
      const restore = db.prepare(
        `UPDATE translation_mappings
           SET seq_no = ?, en = ?, zh_cn = ?, zh_tw = ?, do_not_use = ?, en_key = ?,
               kind = ?, origin = ?, batch_id = ?, updated_at = ?
         WHERE id = ? AND (batch_id = ? OR batch_id IS NULL)`
      );
      for (const row of snapshot.previous ?? []) {
        const result = restore.run(
          row.seq_no ?? null,
          row.en,
          row.zh_cn ?? '',
          row.zh_tw ?? '',
          row.do_not_use ?? '',
          row.en_key,
          row.kind,
          row.origin,
          row.batch_id ?? null,
          row.updated_at ?? now,
          row.id,
          batchId
        );
        if (result.changes > 0) {
          restored++;
          this.writeAliases(row.id, row.en, row.zh_cn ?? '', row.zh_tw ?? '');
        }
      }
      db.prepare('UPDATE glossary_import_batches SET undone_at = ? WHERE id = ?').run(now, batchId);
    });
    apply();
    this.bumpGlossaryVersion();
    this.invalidateGlossary();
    void this.glossary?.refreshEmbeddings().catch((): void => undefined);
    log.info('[Mapping] import batch undone', { batchId, removed, restored });
    return { batchId, removed, restored };
  }

  /** Aggregated counts (for the management UI). */
  getStats(): MappingStats {
    try {
      const db = getDatabase();
      return db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN zh_cn <> '' AND zh_tw <> '' THEN 1 ELSE 0 END), 0) AS complete,
             COALESCE(SUM(CASE WHEN kind = 'term' THEN 1 ELSE 0 END), 0) AS terms,
             COALESCE(SUM(CASE WHEN kind = 'phrase' THEN 1 ELSE 0 END), 0) AS phrases,
             COALESCE(SUM(CASE WHEN zh_tw = '' THEN 1 ELSE 0 END), 0) AS missingZhTw
           FROM translation_mappings`
        )
        .get() as MappingStats;
    } catch (err) {
      log.error('[Mapping] getStats failed:', err);
      return { total: 0, complete: 0, terms: 0, phrases: 0, missingZhTw: 0 };
    }
  }

  /**
   * Extract the glossary column relevant to a target language and format it as
   * a prompt block the AI can reference during translation.
   *
   * Since P2a the caller should pass the **source text**. The matching engine
   * then injects only the entries that actually occur in that file (design
   * §2.7), instead of the previous “first 500 rows” dump.
   *
   * - target zh-CN: English → Simplified Chinese pairs.
   * - target zh-TW: English → Taiwan Traditional Chinese pairs. Entries whose
   *   zh_tw column is empty fall back to zh-CN with a conversion note.
   * - target en: Simplified/Traditional Chinese → English pairs (reverse).
   *
   * Returns `{ text, count }`; `text` is empty when there are no entries.
   */
  getMappingContext(targetLang: LocalizeLanguage, sourceText?: string): { text: string; count: number } {
    // P2a: selective, relevance-filtered matching.
    if (this.glossary && sourceText && sourceText.trim()) {
      const context = this.glossary.buildTranslationContextSync(targetLang, sourceText);
      return { text: context.text, count: context.count };
    }

    // Legacy fallback (no matching engine / no source text): first N rows.
    try {
      const db = getDatabase();
      let rows: { source: string; target: string }[];
      if (targetLang === 'zh-CN') {
        rows = db
          .prepare(
            `SELECT en AS source, zh_cn AS target FROM translation_mappings
             WHERE zh_cn <> ''
             ORDER BY en COLLATE NOCASE ASC LIMIT ?`
          )
          .all(MAX_PROMPT_ENTRIES) as { source: string; target: string }[];
      } else if (targetLang === 'zh-TW') {
        rows = db
          .prepare(
            `SELECT en AS source, zh_tw AS target FROM translation_mappings
             WHERE zh_tw <> ''
             ORDER BY en COLLATE NOCASE ASC LIMIT ?`
          )
          .all(MAX_PROMPT_ENTRIES) as { source: string; target: string }[];
      } else {
        // target en: reverse direction — Chinese → English.
        rows = db
          .prepare(
            `SELECT zh_cn AS source, en AS target FROM translation_mappings
             WHERE zh_cn <> ''
             UNION ALL
             SELECT zh_tw AS source, en AS target FROM translation_mappings
             WHERE zh_tw <> ''
             ORDER BY source COLLATE NOCASE ASC LIMIT ?`
          )
          .all(MAX_PROMPT_ENTRIES) as { source: string; target: string }[];
      }
      if (rows.length === 0) return { text: '', count: 0 };

      const sourceLabel = targetLang === 'en' ? 'Source' : 'English';
      const targetLabel = targetLang === 'en' ? 'English' : targetLang;
      const lines = rows.map((r) => `"${r.source}" | "${r.target}"`);
      const text = [
        `## Translation Glossary (established translations — reference these)`,
        `Language pair: ${sourceLabel} → ${targetLabel}`,
        `When a source phrase matches (or is similar to) a glossary entry, use the provided translation and keep it consistent throughout the document.`,
        `---`,
        ...lines,
      ].join('\n');
      return { text, count: rows.length };
    } catch (err) {
      log.error('[Mapping] getMappingContext failed:', err);
      return { text: '', count: 0 };
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Tell the matching engine its cached index is stale. */
  private invalidateGlossary(entryId?: string): void {
    this.glossary?.invalidate(entryId);
  }

  /**
   * Replace the stored alias rows of one entry (design §2.5.3 step 1).
   * Uses a prepared statement so a 50k-row import stays linear.
   */
  private writeAliases(entryId: string, en: string, zhCN: string, zhTW: string): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM glossary_aliases WHERE entry_id = ?').run(entryId);
      const bundle = expandAliases({ en, zhCN, zhTW });
      const insert = db.prepare(
        `INSERT OR REPLACE INTO glossary_aliases (entry_id, lang, alias, alias_key, alias_kind)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const alias of bundle.en) {
        insert.run(entryId, 'en', alias.alias, alias.aliasKey, alias.kind);
      }
      for (const alias of bundle.zh) {
        insert.run(entryId, 'zh', alias.alias, alias.aliasKey, alias.kind);
      }
    } catch (err) {
      log.warn('[Mapping] writeAliases failed:', err);
    }
  }

  /**
   * Compute aliases for rows that predate the alias table (default terms and
   * imports applied before P2a). Safe to call on every start-up: entries that
   * already have aliases are skipped.
   */
  backfillAliases(): number {
    let count = 0;
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          `SELECT m.id, m.en, m.zh_cn, m.zh_tw FROM translation_mappings m
           WHERE NOT EXISTS (SELECT 1 FROM glossary_aliases a WHERE a.entry_id = m.id)`
        )
        .all() as { id: string; en: string; zh_cn: string; zh_tw: string }[];
      const transaction = db.transaction(() => {
        for (const row of rows) {
          this.writeAliases(row.id, row.en, row.zh_cn, row.zh_tw);
          count++;
        }
      });
      transaction();
      if (count > 0) log.info('[Mapping] glossary aliases backfilled', { entries: count });
    } catch (err) {
      log.warn('[Mapping] backfillAliases failed:', err);
    }
    return count;
  }

  /** Increment the glossary version so cached indexes rebuild lazily. */
  private bumpGlossaryVersion(): void {
    try {
      const current = Number.parseInt(getSetting(GLOSSARY_VERSION_KEY) ?? '1', 10) || 1;
      setSetting(GLOSSARY_VERSION_KEY, current + 1);
    } catch (err) {
      log.warn('[Mapping] failed to bump glossary version:', err);
    }
  }

  /** Write every glossary row to `userData/backups/glossary-<timestamp>.json`. */
  private backupGlossary(): string | null {
    try {
      const dir = this.backupDir;
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `glossary-${stamp}.json`);
      const rows = this.listAllMappings().map((m) => ({
        seqNo: m.seqNo ?? null,
        en: m.en,
        zhCN: m.zhCN,
        zhTW: m.zhTW,
        doNotUse: m.doNotUse ?? [],
        kind: m.kind,
        origin: m.origin,
      }));
      fs.writeFileSync(
        file,
        JSON.stringify({ createdAt: new Date().toISOString(), rows }, null, 2),
        'utf-8'
      );
      return file;
    } catch (err) {
      log.error('[Mapping] backupGlossary failed:', err);
      return null;
    }
  }
}
