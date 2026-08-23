// Types for the translation mapping (glossary) feature.
// A mapping is one English term with its Simplified Chinese (zh-CN) and Taiwan
// Traditional Chinese (zh-TW) translations, persisted in the local SQLite
// database (`translation_mappings` table). During localization the relevant
// language column is extracted and injected into the AI prompt so the model
// reuses the established terminology.

/** One glossary row: English → 简体中文 → 繁體中文（台灣）. */
export interface TranslationMapping {
  id: string;
  /** English source term. */
  en: string;
  /** Simplified Chinese translation. */
  zhCN: string;
  /** Taiwan Traditional Chinese translation. */
  zhTW: string;
  createdAt: string;
  updatedAt: string;
}

/** A raw row parsed from an imported Excel/CSV file (3 columns). */
export interface MappingImportRow {
  en: string;
  zhCN: string;
  zhTW: string;
}

/** Result of a bulk mapping import. */
export interface MappingImportResult {
  imported: number;
  skipped: number;
  /** Human-readable reasons for skipped rows (dedupe / empty cells). */
  errors: string[];
}

/** Aggregated mapping counts (shown in the management UI). */
export interface MappingStats {
  total: number;
  /** Rows where all three columns are filled. */
  complete: number;
}

/** Result of parsing an import file (before the user confirms the import). */
export interface MappingImportParseResult {
  fileName: string;
  rows: MappingImportRow[];
}