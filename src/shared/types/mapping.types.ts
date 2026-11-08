// Types for the translation mapping / glossary feature.
//
// A mapping is one English term (en-US) with its Simplified Chinese (zh-CN)
// and Taiwan Traditional Chinese (zh-TW) translations, persisted in the local
// SQLite database (`translation_mappings` table). During localization the
// relevant language column is extracted and injected into the AI prompt so the
// model reuses the established terminology.
//
// Since P1 the table also stores import metadata (`seqNo`, `kind`, `origin`)
// and a normalized dedupe key (`enKey`), and the import flow is plan based:
// parsing → `ImportPlan` preview → transactional apply.

/** Whether a row behaves like a single term or a sentence/wording entry. */
export type GlossaryEntryKind = 'term' | 'phrase';

/** Where an entry came from. */
export type GlossaryOrigin = 'default' | 'import' | 'manual';

/** One glossary row: English → 简体中文 → 繁體中文（台灣）. */
export interface TranslationMapping {
  id: string;
  /** `No.` column from the imported file; display/sort only. */
  seqNo?: number;
  /** English source term. */
  en: string;
  /** Simplified Chinese translation (may be empty for term-only entries). */
  zhCN: string;
  /** Taiwan Traditional Chinese translation (may be empty). */
  zhTW: string;
  /**
   * Forbidden / deprecated wordings for this entry (P4-6, the optional
   * `Do not use` import column). The reviewer reports them; they are never
   * injected as approved terminology.
   */
  doNotUse: string[];
  /** Normalized English dedupe key. */
  enKey: string;
  kind: GlossaryEntryKind;
  origin: GlossaryOrigin;
  createdAt: string;
  updatedAt: string;
}

/** A raw row parsed from an imported Excel/CSV file. */
export interface MappingImportRow {
  en: string;
  zhCN: string;
  zhTW: string;
}

/** Query accepted by the paginated glossary list IPC. */
export interface MappingListQuery {
  /** Free-text search across English / 简体中文 / 繁體中文. */
  search?: string;
  offset?: number;
  limit?: number;
  /** Filter by entry kind. */
  kind?: GlossaryEntryKind;
}

/** Paginated glossary list response. */
export interface MappingListResult {
  items: TranslationMapping[];
  total: number;
}

/** Aggregated mapping counts (shown in the management UI). */
export interface MappingStats {
  total: number;
  /** Rows where all three language columns are filled. */
  complete: number;
  /** Term-style entries (`kind = 'term'`). */
  terms: number;
  /** Sentence/wording entries (`kind = 'phrase'`). */
  phrases: number;
  /** Entries whose zh-TW column is empty (new-format imports). */
  missingZhTw: number;
}

// ── Import parsing ─────────────────────────────────────────────────────────

/** Column indexes (0-based) detected for an import file. */
export interface GlossaryColumnMap {
  /** `No.` / 序号 column. */
  seq?: number;
  /** English column (required). */
  en: number;
  /** Simplified Chinese column. */
  zhCN?: number;
  /** Taiwan Traditional Chinese column. */
  zhTW?: number;
  /** Optional `Do not use` (forbidden wording) column (P4-6). */
  forbidden?: number;
  detectedBy: 'header' | 'position' | 'manual';
  /** 1-based source row that held the header (rows up to here are skipped). */
  headerRow?: number;
}

/** Overrides the user may submit from the import preview dialog. */
export type GlossaryColumnOverride = Partial<
  Pick<GlossaryColumnMap, 'seq' | 'en' | 'zhCN' | 'zhTW' | 'forbidden' | 'headerRow'>
>;

/** One data row read from the import file (1-based source row number). */
export interface ParsedGlossaryRow {
  row: number;
  seq?: number;
  en: string;
  zhCN: string;
  zhTW: string;
  /** Forbidden / deprecated wordings from the optional 4th column (P4-6). */
  doNotUse?: string[];
}

/** Result of parsing an import file (before a plan is built). */
export interface GlossaryParseResult {
  fileName: string;
  /** Sheet names (single entry for CSV). */
  sheets: string[];
  /** Index of the parsed sheet. */
  sheetIndex: number;
  columns: GlossaryColumnMap;
  rows: ParsedGlossaryRow[];
  warnings: string[];
}

// ── Import plan ────────────────────────────────────────────────────────────

export type GlossaryImportMode = 'append' | 'replace';
export type ConflictStrategy = 'overwrite' | 'keepExisting';

export type ImportIssueKind =
  | 'invalid'
  | 'dupInFile'
  | 'conflictInFile'
  | 'sameAsDb'
  | 'conflictWithDb';

export type ImportResolution = 'skipped' | 'merged' | 'overwritten' | 'kept';

/** One row-level notice surfaced in the import preview. */
export interface ImportRowIssue {
  /** 1-based source row number. */
  row: number;
  kind: ImportIssueKind;
  en: string;
  incoming?: { zhCN: string; zhTW?: string };
  existing?: { zhCN: string; zhTW?: string };
  resolution: ImportResolution;
}

/** Preview of what an import will do (recomputed when options change). */
export interface ImportPlan {
  mode: GlossaryImportMode;
  strategy: ConflictStrategy;
  keepDefaults: boolean;
  totalRows: number;
  toInsert: number;
  toUpdate: number;
  /** Number of existing rows a `replace` import will delete. */
  toDelete: number;
  skipped: number;
  /** Capped at 500 entries; counts above remain accurate. */
  issues: ImportRowIssue[];
  /** Total issue count (may exceed `issues.length`). */
  issueCount: number;
}

/** Result of parsing + planning, returned by `mapping:importParse`. */
export interface MappingImportParseResult {
  parseId: string;
  fileName: string;
  sheets: string[];
  sheetIndex: number;
  columns: GlossaryColumnMap;
  /** First 20 parsed rows, for the preview table. */
  preview: ParsedGlossaryRow[];
  plan: ImportPlan;
  warnings: string[];
}

/** Result of recomputing the plan with different options. */
export interface MappingImportPlanResult {
  parseId: string;
  sheets: string[];
  sheetIndex: number;
  columns: GlossaryColumnMap;
  preview: ParsedGlossaryRow[];
  plan: ImportPlan;
  warnings: string[];
}

/** Final result of an applied import. */
export interface MappingImportResult extends ImportPlan {
  batchId: string;
  backupPath?: string;
  durationMs: number;
}

// ── Backups + import batch undo (P4-1 / P4-2) ──────────────────────────────

/** One glossary backup file under `userData/backups`. */
export interface GlossaryBackupInfo {
  fileName: string;
  path: string;
  createdAt: string;
  rows: number;
  size: number;
}

/** Result of restoring a glossary backup. */
export interface GlossaryRestoreResult {
  /** Rows written from the backup. */
  restored: number;
  /** Backup of the pre-restore state (so the restore itself is undoable). */
  backupPath?: string;
}

/** One applied import batch (audit + undo). */
export interface GlossaryImportBatchInfo {
  id: string;
  fileName: string;
  mode: GlossaryImportMode;
  createdAt: string;
  /** Import plan summary stored with the batch. */
  stats: ImportPlan | null;
  backupPath?: string;
  /** False once the batch has been undone. */
  undoable: boolean;
  /** Set when the batch was undone (ISO timestamp). */
  undoneAt?: string;
}

/** Result of undoing one import batch. */
export interface GlossaryBatchUndoResult {
  batchId: string;
  /** Rows inserted by the batch that were deleted. */
  removed: number;
  /** Rows of the batch that were restored to their pre-import state. */
  restored: number;
}