import { getDatabase } from '../storage/database';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { en as ui, formatUi } from '../../../shared/i18n';
import type { LocalizeLanguage } from '../../../shared/types/document.types';
import type {
  TranslationMapping,
  MappingImportRow,
  MappingImportResult,
  MappingStats,
} from '../../../shared/types/mapping.types';

/** Max glossary entries injected into a single AI prompt (keeps prompts bounded). */
const MAX_PROMPT_ENTRIES = 500;

interface MappingRow {
  id: string;
  en: string;
  zh_cn: string;
  zh_tw: string;
  created_at: string;
  updated_at: string;
}

function toMapping(r: MappingRow): TranslationMapping {
  return {
    id: r.id,
    en: r.en,
    zhCN: r.zh_cn,
    zhTW: r.zh_tw,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Translation mapping (glossary) service.
 *
 * Persists three-column glossary rows (English → 简体中文 → 繁體中文) in the
 * local SQLite database and exposes CRUD + bulk import. During localization
 * the service extracts the column relevant to the target language and formats
 * it into a prompt block (`getMappingContext`) so the AI reuses the
 * established terminology instead of guessing.
 */
export class MappingService {
  /** List mappings, optionally filtered by a free-text search across all columns. */
  listMappings(search?: string): TranslationMapping[] {
    try {
      const db = getDatabase();
      let sql = 'SELECT * FROM translation_mappings';
      const params: string[] = [];
      const term = search?.trim();
      if (term) {
        sql += ' WHERE en LIKE ? OR zh_cn LIKE ? OR zh_tw LIKE ?';
        const like = `%${term}%`;
        params.push(like, like, like);
      }
      sql += ' ORDER BY en COLLATE NOCASE ASC';
      const rows = db.prepare(sql).all(...params) as MappingRow[];
      return rows.map(toMapping);
    } catch (err) {
      log.error('[Mapping] listMappings failed:', err);
      return [];
    }
  }

  /** Add a single mapping. Returns null when the English term already exists. */
  addMapping(en: string, zhCN: string, zhTW: string): TranslationMapping | null {
    const enText = en.trim();
    const zhCNText = zhCN.trim();
    const zhTWText = zhTW.trim();
    if (!enText || !zhCNText || !zhTWText) return null;
    try {
      const db = getDatabase();
      const existing = db
        .prepare('SELECT id FROM translation_mappings WHERE en = ? COLLATE NOCASE')
        .get(enText) as { id: string } | undefined;
      if (existing) return null;
      const now = new Date().toISOString();
      const id = uuidv4();
      db.prepare(
        `INSERT INTO translation_mappings (id, en, zh_cn, zh_tw, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, enText, zhCNText, zhTWText, now, now);
      return {
        id,
        en: enText,
        zhCN: zhCNText,
        zhTW: zhTWText,
        createdAt: now,
        updatedAt: now,
      };
    } catch (err) {
      log.error('[Mapping] addMapping failed:', err);
      return null;
    }
  }

  /** Update the three columns of an existing mapping. */
  updateMapping(id: string, en: string, zhCN: string, zhTW: string): TranslationMapping | null {
    const enText = en.trim();
    const zhCNText = zhCN.trim();
    const zhTWText = zhTW.trim();
    if (!enText || !zhCNText || !zhTWText) return null;
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `UPDATE translation_mappings SET en = ?, zh_cn = ?, zh_tw = ?, updated_at = ? WHERE id = ?`
        )
        .run(enText, zhCNText, zhTWText, now, id);
      if (result.changes === 0) return null;
      const row = db.prepare('SELECT * FROM translation_mappings WHERE id = ?').get(id) as
        | MappingRow
        | undefined;
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
    } catch (err) {
      log.error('[Mapping] deleteMapping failed:', err);
    }
  }

  /**
   * Bulk import three-column rows. Rows with empty cells or duplicate English
   * terms (existing in DB or within the batch) are skipped and reported.
   */
  importMappings(rows: MappingImportRow[]): MappingImportResult {
    const result: MappingImportResult = { imported: 0, skipped: 0, errors: [] };
    if (!rows || rows.length === 0) return result;
    try {
      const db = getDatabase();
      const existing = new Set(
        (db.prepare('SELECT en FROM translation_mappings').all() as { en: string }[]).map((r) =>
          r.en.trim().toLowerCase()
        )
      );
      const seenInBatch = new Set<string>();
      const insert = db.prepare(
        `INSERT INTO translation_mappings (id, en, zh_cn, zh_tw, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const now = new Date().toISOString();
      const insertAll = db.transaction((items: MappingImportRow[]) => {
        for (const item of items) {
          insert.run(uuidv4(), item.en, item.zhCN, item.zhTW, now, now);
        }
      });

      const toInsert: MappingImportRow[] = [];
      for (const row of rows) {
        const en = (row.en ?? '').trim();
        const zhCN = (row.zhCN ?? '').trim();
        const zhTW = (row.zhTW ?? '').trim();
        if (!en || !zhCN || !zhTW) {
          result.skipped++;
          result.errors.push(formatUi(ui.backend.skipEmptyRow, { values: `${en || '(empty)'} / ${zhCN || '(empty)'} / ${zhTW || '(empty)'}` }));
          continue;
        }
        const key = en.toLowerCase();
        if (existing.has(key) || seenInBatch.has(key)) {
          result.skipped++;
          result.errors.push(formatUi(ui.backend.skipDuplicate, { term: en }));
          continue;
        }
        existing.add(key);
        seenInBatch.add(key);
        toInsert.push({ en, zhCN, zhTW });
      }
      if (toInsert.length > 0) insertAll(toInsert);
      result.imported = toInsert.length;
      log.info('[Mapping] importMappings done', {
        imported: result.imported,
        skipped: result.skipped,
      });
    } catch (err) {
      log.error('[Mapping] importMappings failed:', err);
      result.errors.push(formatUi(ui.backend.importFailed, { error: err instanceof Error ? err.message : String(err) }));
    }
    return result;
  }

  /** Aggregated counts (for the management UI). */
  getStats(): MappingStats {
    try {
      const db = getDatabase();
      const totalRow = db.prepare('SELECT COUNT(*) AS c FROM translation_mappings').get() as {
        c: number;
      };
      const completeRow = db
        .prepare(
          `SELECT COUNT(*) AS c FROM translation_mappings
           WHERE en <> '' AND zh_cn <> '' AND zh_tw <> ''`
        )
        .get() as { c: number };
      return { total: totalRow.c, complete: completeRow.c };
    } catch (err) {
      log.error('[Mapping] getStats failed:', err);
      return { total: 0, complete: 0 };
    }
  }

  /**
   * Extract the glossary column relevant to a target language and format it as
   * a prompt block the AI can reference during translation.
   *
   * - target zh-CN: English → Simplified Chinese pairs.
   * - target zh-TW: English → Taiwan Traditional Chinese pairs.
   * - target en: Simplified/Traditional Chinese → English pairs (reverse).
   *
   * Returns `{ text, count }`; `text` is empty when there are no entries.
   */
  getMappingContext(targetLang: LocalizeLanguage): { text: string; count: number } {
    try {
      const db = getDatabase();
      let rows: { source: string; target: string }[];
      if (targetLang === 'zh-CN') {
        rows = db
          .prepare(
            `SELECT en AS source, zh_cn AS target FROM translation_mappings
             ORDER BY en COLLATE NOCASE ASC LIMIT ?`
          )
          .all(MAX_PROMPT_ENTRIES) as { source: string; target: string }[];
      } else if (targetLang === 'zh-TW') {
        rows = db
          .prepare(
            `SELECT en AS source, zh_tw AS target FROM translation_mappings
             ORDER BY en COLLATE NOCASE ASC LIMIT ?`
          )
          .all(MAX_PROMPT_ENTRIES) as { source: string; target: string }[];
      } else {
        // target en: reverse direction — Chinese → English.
        rows = db
          .prepare(
            `SELECT zh_cn AS source, en AS target FROM translation_mappings
             UNION ALL
             SELECT zh_tw AS source, en AS target FROM translation_mappings
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
}
