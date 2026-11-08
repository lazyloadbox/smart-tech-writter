// Glossary import dedupe / planning (P1-5).
//
// Turns the parsed file rows into an {@link ImportPlan} (what the preview dialog
// shows) plus the concrete insert/update operations the service will execute.
// The classification rules come from design doc §2.4.4:
//
//   invalid         en is empty                       → skipped
//   dupInFile       same en_key + same zh-CN          → merged (first kept)
//   conflictInFile  same en_key + different zh-CN     → overwrite: latest wins
//                                                       keepExisting: first wins
//   sameAsDb        same en_key + same translations   → skipped
//   conflictWithDb  same en_key + different zh        → overwrite / keepExisting
//   new             anything else                     → insert
//
// Pure functions only — no database or Electron access — so the whole planner
// is covered by vitest.

import type {
  ConflictStrategy,
  GlossaryEntryKind,
  GlossaryImportMode,
  GlossaryOrigin,
  ImportPlan,
  ImportRowIssue,
  ParsedGlossaryRow,
} from '../../../shared/types/mapping.types';
import { classifyEntryKind, cleanCellText, normalizeEn, normalizeZh } from './normalize';

/** Maximum number of row-level issues returned in a plan (counts stay exact). */
export const MAX_PLAN_ISSUES = 500;

/** Existing database row relevant to the planner. */
export interface ExistingGlossaryEntry {
  id: string;
  enKey: string;
  en: string;
  zhCN: string;
  zhTW: string;
  origin: GlossaryOrigin;
  /** Forbidden wordings (P4-6). */
  doNotUse?: string[];
}

/** A row the importer will insert. */
export interface ImportInsertOperation {
  enKey: string;
  en: string;
  zhCN: string;
  zhTW: string;
  seqNo?: number;
  kind: GlossaryEntryKind;
  doNotUse?: string[];
}

/** A row the importer will update (only produced by `overwrite`). */
export interface ImportUpdateOperation {
  id: string;
  enKey: string;
  zhCN: string;
  zhTW: string;
  kind: GlossaryEntryKind;
  doNotUse?: string[];
}

/** Concrete operations to execute after the user confirms. */
export interface ImportOperations {
  inserts: ImportInsertOperation[];
  updates: ImportUpdateOperation[];
}

export interface BuildImportPlanInput {
  rows: ParsedGlossaryRow[];
  /**
   * Entries that will still exist after the mode-specific deletion step:
   * everything for `append`, only defaults for `replace` + `keepDefaults`,
   * nothing for a plain `replace`.
   */
  existing: ExistingGlossaryEntry[];
  /** Total rows currently stored (used to report `toDelete`). */
  existingTotal: number;
  mode: GlossaryImportMode;
  strategy: ConflictStrategy;
  keepDefaults: boolean;
}

interface PendingInsert extends ImportInsertOperation {
  /** zh-CN of the first file occurrence, used for duplicate detection. */
  firstZhKey: string;
  /** zh-CN of the row that currently wins. */
  currentZhKey: string;
}

/** A database row already represented by an update operation. */
interface PendingUpdate {
  id: string;
  enKey: string;
  zhCN: string;
  zhTW: string;
  kind: GlossaryEntryKind;
  doNotUse?: string[];
}

/** Classify one existing row against an incoming row. */
function isSameTranslation(existing: ExistingGlossaryEntry, row: ParsedGlossaryRow): boolean {
  if (normalizeZh(existing.zhCN) !== normalizeZh(row.zhCN)) return false;
  // An import without a zh-TW column must not count as a change of zh-TW.
  if (row.zhTW && normalizeZh(existing.zhTW) !== normalizeZh(row.zhTW)) return false;
  // A newly provided forbidden list is a change; an absent one is not.
  const incomingForbidden = (row.doNotUse ?? []).map((t) => t.toLowerCase()).join('|');
  if (incomingForbidden) {
    const existingForbidden = (existing.doNotUse ?? []).map((t) => t.toLowerCase()).join('|');
    if (existingForbidden !== incomingForbidden) return false;
  }
  return true;
}

/**
 * Build the import plan and the matching insert/update operations.
 */
export function buildImportPlan(input: BuildImportPlanInput): {
  plan: ImportPlan;
  operations: ImportOperations;
} {
  const { rows, existing, existingTotal, mode, strategy, keepDefaults } = input;

  const issues: ImportRowIssue[] = [];
  let issueCount = 0;
  const pushIssue = (issue: ImportRowIssue): void => {
    issueCount++;
    if (issues.length < MAX_PLAN_ISSUES) issues.push(issue);
  };

  let skipped = 0;
  const pending = new Map<string, PendingInsert>();
  const updates: ImportUpdateOperation[] = [];
  const handledUpdates = new Map<string, PendingUpdate>();
  const existingByKey = new Map(existing.map((e) => [e.enKey, e]));

  for (const row of rows) {
    const en = cleanCellText(row.en);
    const enKey = normalizeEn(en);
    const zhCN = cleanCellText(row.zhCN);
    const zhTW = cleanCellText(row.zhTW);
    const doNotUse = (row.doNotUse ?? []).filter(Boolean);

    if (!enKey) {
      skipped++;
      pushIssue({
        row: row.row,
        kind: 'invalid',
        en,
        incoming: { zhCN, zhTW },
        resolution: 'skipped',
      });
      continue;
    }

    const zhKey = normalizeZh(zhCN);
    const inFile = pending.get(enKey) ?? null;

    // ── 1. Duplicates / conflicts inside the file ─────────────────────────
    if (inFile) {
      if (zhKey === inFile.firstZhKey || zhKey === inFile.currentZhKey) {
        skipped++;
        pushIssue({
          row: row.row,
          kind: 'dupInFile',
          en,
          incoming: { zhCN, zhTW },
          existing: { zhCN: inFile.zhCN, zhTW: inFile.zhTW },
          resolution: 'merged',
        });
        continue;
      }
      // Same English term, different Chinese translation.
      if (strategy === 'overwrite') {
        // The later occurrence is treated as the in-file revision.
        inFile.en = en;
        inFile.zhCN = zhCN;
        inFile.zhTW = zhTW;
        if (doNotUse.length > 0) inFile.doNotUse = doNotUse;
        inFile.seqNo = row.seq;
        inFile.kind = classifyEntryKind(en);
        inFile.currentZhKey = zhKey;
        pushIssue({
          row: row.row,
          kind: 'conflictInFile',
          en,
          incoming: { zhCN, zhTW },
          resolution: 'overwritten',
        });
      } else {
        skipped++;
        pushIssue({
          row: row.row,
          kind: 'conflictInFile',
          en,
          incoming: { zhCN, zhTW },
          existing: { zhCN: inFile.zhCN, zhTW: inFile.zhTW },
          resolution: 'kept',
        });
      }
      continue;
    }

    // A row that conflicted with a database entry is already represented by an
    // update operation; later occurrences are compared against it.
    const updated = handledUpdates.get(enKey);
    if (updated) {
      if (normalizeZh(updated.zhCN) === zhKey) {
        skipped++;
        pushIssue({
          row: row.row,
          kind: 'dupInFile',
          en,
          incoming: { zhCN, zhTW },
          existing: { zhCN: updated.zhCN, zhTW: updated.zhTW },
          resolution: 'merged',
        });
      } else if (strategy === 'overwrite') {
        updated.zhCN = zhCN;
        if (zhTW) updated.zhTW = zhTW;
        if (doNotUse.length > 0) updated.doNotUse = doNotUse;
        updated.kind = classifyEntryKind(en);
        pushIssue({
          row: row.row,
          kind: 'conflictInFile',
          en,
          incoming: { zhCN, zhTW },
          resolution: 'overwritten',
        });
      } else {
        skipped++;
        pushIssue({
          row: row.row,
          kind: 'conflictInFile',
          en,
          incoming: { zhCN, zhTW },
          existing: { zhCN: updated.zhCN, zhTW: updated.zhTW },
          resolution: 'kept',
        });
      }
      continue;
    }

    // ── 2. Compare with the database ──────────────────────────────────────
    const dbEntry = existingByKey.get(enKey);
    if (dbEntry) {
      if (isSameTranslation(dbEntry, row)) {
        skipped++;
        pushIssue({
          row: row.row,
          kind: 'sameAsDb',
          en,
          incoming: { zhCN, zhTW },
          existing: { zhCN: dbEntry.zhCN, zhTW: dbEntry.zhTW },
          resolution: 'skipped',
        });
        continue;
      }
      if (strategy === 'keepExisting') {
        skipped++;
        pushIssue({
          row: row.row,
          kind: 'conflictWithDb',
          en,
          incoming: { zhCN, zhTW },
          existing: { zhCN: dbEntry.zhCN, zhTW: dbEntry.zhTW },
          resolution: 'kept',
        });
        continue;
      }
      const update: ImportUpdateOperation = {
        id: dbEntry.id,
        enKey,
        zhCN,
        // An import without zh-TW keeps the stored Traditional Chinese value.
        zhTW: zhTW || dbEntry.zhTW,
        kind: classifyEntryKind(en),
        // An import without the column keeps the stored forbidden list.
        doNotUse: doNotUse.length > 0 ? doNotUse : dbEntry.doNotUse,
      };
      updates.push(update);
      handledUpdates.set(enKey, {
        id: dbEntry.id,
        enKey,
        zhCN: update.zhCN,
        zhTW: update.zhTW,
        kind: update.kind,
        doNotUse: update.doNotUse,
      });
      pushIssue({
        row: row.row,
        kind: 'conflictWithDb',
        en,
        incoming: { zhCN, zhTW },
        existing: { zhCN: dbEntry.zhCN, zhTW: dbEntry.zhTW },
        resolution: 'overwritten',
      });
      continue;
    }

    // ── 3. Brand new entry ────────────────────────────────────────────────
    pending.set(enKey, {
      enKey,
      en,
      zhCN,
      zhTW,
      doNotUse,
      seqNo: row.seq,
      kind: classifyEntryKind(en),
      firstZhKey: zhKey,
      currentZhKey: zhKey,
    });
  }

  const inserts: ImportInsertOperation[] = Array.from(pending.values()).map((entry) => ({
    enKey: entry.enKey,
    en: entry.en,
    zhCN: entry.zhCN,
    zhTW: entry.zhTW,
    seqNo: entry.seqNo,
    kind: entry.kind,
    doNotUse: entry.doNotUse,
  }));

  const toDelete = mode === 'replace' ? Math.max(0, existingTotal - existing.length) : 0;

  return {
    plan: {
      mode,
      strategy,
      keepDefaults,
      totalRows: rows.length,
      toInsert: inserts.length,
      toUpdate: updates.length,
      toDelete,
      skipped,
      issues,
      issueCount,
    },
    operations: { inserts, updates },
  };
}
