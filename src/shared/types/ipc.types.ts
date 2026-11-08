// IPC channel names and payload types shared between main and renderer

export const IPC_CHANNELS = {
  // Workflow
  WORKFLOW_START: 'workflow:start',
  WORKFLOW_PAUSE: 'workflow:pause',
  WORKFLOW_RESUME: 'workflow:resume',
  WORKFLOW_STATUS: 'workflow:status',
  WORKFLOW_PROGRESS: 'workflow:progress',
  WORKFLOW_GO_BACK: 'workflow:goBack',
  WORKFLOW_STREAM: 'workflow:stream',
  WORKFLOW_HUMAN_REVIEW_SUBMIT: 'workflow:humanReviewSubmit',
  WORKFLOW_HUMAN_CONFIRM_SUBMIT: 'workflow:humanConfirmSubmit',
  WORKFLOW_HUMAN_LOCALIZE_SUBMIT: 'workflow:humanLocalizeSubmit',
  WORKFLOW_HUMAN_DITA_SUBMIT: 'workflow:humanDitaSubmit',
  WORKFLOW_REVIEW_CONTINUE: 'workflow:reviewContinue',
  WORKFLOW_AI_EDIT_DRAFT: 'workflow:aiEditDraft',
  WORKFLOW_AI_EDIT_ARTIFACT: 'workflow:aiEditArtifact',
  // File
  FILE_SELECT: 'file:select',
  FILE_READ: 'file:read',
  FILE_SAVE_DITA: 'file:saveDita',
  FILE_EXPORT_ALL: 'file:exportAll',
  FILE_EXPORT_BUNDLE: 'file:exportBundle',
  FILE_SPLIT_PREVIEW: 'file:splitPreview',
  FILE_SPLIT_EXPORT: 'file:splitExport',
  // RAG
  RAG_QUERY: 'rag:query',
  RAG_ADD_DOCUMENT: 'rag:addDocument',
  RAG_REMOVE_DOCUMENT: 'rag:removeDocument',
  RAG_CLEAR_INDEX: 'rag:clearIndex',
  RAG_INDEX_STATS: 'rag:indexStats',
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RELOAD_PROVIDER: 'settings:reloadProvider',
  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_GET_PATHS: 'app:getPaths',
  APP_OPEN_PATH: 'app:openPath',
  // Prompts
  PROMPTS_GET: 'prompts:get',
  PROMPTS_SET: 'prompts:set',
  PROMPTS_RESET: 'prompts:reset',
  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_GET_STATE: 'projects:getState',
  PROJECTS_DELETE: 'projects:delete',
  // Localization (standalone DITA translation feature)
  LOCALIZE_SELECT_FILES: 'localize:selectFiles',
  LOCALIZE_START: 'localize:start',
  LOCALIZE_STATUS: 'localize:status',
  LOCALIZE_EXPORT: 'localize:export',
  LOCALIZE_PROGRESS: 'localize:progress',
  LOCALIZE_STREAM: 'localize:stream',
  LOCALIZE_CONTINUE: 'localize:continue',
  LOCALIZE_HUMAN_LOCALIZE_SUBMIT: 'localize:humanLocalizeSubmit',
  LOCALIZE_HUMAN_CONFIRM_SUBMIT: 'localize:humanConfirmSubmit',
  LOCALIZE_AI_EDIT_ARTIFACT: 'localize:aiEditArtifact',
  LOCALIZE_GO_BACK: 'localize:goBack',
  // Localization run history (persisted runs)
  LOCALIZE_RUNS_LIST: 'localize:runsList',
  LOCALIZE_RUNS_GET: 'localize:runsGet',
  LOCALIZE_RUNS_DELETE: 'localize:runsDelete',
  LOCALIZE_RUNS_LOAD: 'localize:runsLoad',
  LOCALIZE_SPLIT_PREVIEW: 'localize:splitPreview',
  LOCALIZE_SPLIT_EXPORT: 'localize:splitExport',
  // Translation mapping (glossary) management
  MAPPING_LIST: 'mapping:list',
  MAPPING_ADD: 'mapping:add',
  MAPPING_UPDATE: 'mapping:update',
  MAPPING_DELETE: 'mapping:delete',
  MAPPING_IMPORT_PARSE: 'mapping:importParse',
  MAPPING_IMPORT_PLAN: 'mapping:importPlan',
  MAPPING_IMPORT: 'mapping:import',
  MAPPING_EXPORT: 'mapping:export',
  MAPPING_STATS: 'mapping:stats',
  /** Glossary backups (P4-1). */
  MAPPING_BACKUPS: 'mapping:backups',
  MAPPING_RESTORE: 'mapping:restore',
  /** Import batch audit + undo (P4-2). */
  MAPPING_BATCHES: 'mapping:batches',
  MAPPING_BATCH_UNDO: 'mapping:batchUndo',
  // Glossary matching engine (P2a)
  GLOSSARY_GET_SETTINGS: 'glossary:getSettings',
  GLOSSARY_SET_SETTINGS: 'glossary:setSettings',
  GLOSSARY_INDEX_STATUS: 'glossary:indexStatus',
  GLOSSARY_TEST_MATCH: 'glossary:testMatch',
  GLOSSARY_ENTRIES: 'glossary:entries',
  /** Pre-export terminology usage report (P4-4). */
  GLOSSARY_USAGE_REPORT: 'glossary:usageReport',
  // Semantic model management (P2b)
  GLOSSARY_MODEL_DOWNLOAD: 'glossary:modelDownload',
  GLOSSARY_MODEL_CANCEL: 'glossary:modelCancel',
  GLOSSARY_MODEL_INSTALL_PACKAGE: 'glossary:modelInstallFromPackage',
  GLOSSARY_MODEL_INSTALL_FOLDER: 'glossary:modelInstallFromFolder',
  GLOSSARY_MODEL_CONFIRM_CUSTOM: 'glossary:modelConfirmCustom',
  GLOSSARY_MODEL_EXPORT_PACKAGE: 'glossary:modelExportPackage',
  GLOSSARY_MODEL_VERIFY: 'glossary:modelVerify',
  GLOSSARY_MODEL_RETRY: 'glossary:modelRetry',
  GLOSSARY_MODEL_REMOVE: 'glossary:modelRemove',
  GLOSSARY_MODEL_CLEAR_NATIVE: 'glossary:modelClearNativeFailure',
  /** Main → renderer broadcast. */
  GLOSSARY_MODEL_PROGRESS: 'glossary:modelProgress',
  // Background vector indexing (P2b)
  GLOSSARY_EMBEDDING_START: 'glossary:embeddingStart',
  GLOSSARY_EMBEDDING_PAUSE: 'glossary:embeddingPause',
  /** Main → renderer broadcast. */
  GLOSSARY_EMBEDDING_PROGRESS: 'glossary:embeddingProgress',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

export interface WorkflowStartPayload {
  projectId: string;
  filePaths: string[];
  /** 可选：自定义文档大纲（章节结构），未提供时使用默认 6 章节 */
  documentOutline?: import('./document.types').DocumentOutline;
  /**
   * 可选：全局解析提示词（解析思路 / 重点 / 分析设计），
   * 注入到上传 & 解析阶段的文件解析 Agent 与 map-reduce 摘要。
   */
  parseInstruction?: string;
  /**
   * 可选：单文件解析提示词（按文件路径），用于对特定文件做特殊处理，
   * 优先级高于全局解析提示词。
   */
  fileInstructions?: Record<string, string>;
  /** 可选：本项目是否使用术语库（默认 true，P3）。 */
  useGlossary?: boolean;
}

export interface WorkflowProgressEvent {
  projectId: string;
  stage: string;
  status: string;
  message?: string;
  data?: unknown;
  /** New log entries to append */
  logEntries?: import('./workflow.types').WorkflowLogEntry[];
}

export interface WorkflowGoBackPayload {
  projectId: string;
  targetStage: import('./workflow.types').StageName;
}

export interface WorkflowStreamEvent {
  projectId: string;
  stage: string;
  /** Typed stream delta — `thinking` = reasoning_content, `content` = visible output. */
  chunk: {
    type: 'thinking' | 'content';
    text: string;
  };
}

export interface HumanReviewSubmitPayload {
  projectId: string;
  /** Full edited drafts (multi-draft support). The active doc's content is applied. */
  editedDrafts: import('./document.types').DocumentDraft[];
  acceptedCommentIds: string[];
}

export interface HumanConfirmSubmitPayload {
  projectId: string;
  approved: boolean;
  /** Selected target language for localization */
  targetLanguage?: import('./document.types').LocalizeLanguage;
  /**
   * When true, skip the localization stages entirely and go straight from
   * Stage 6b to DITA generation (using the English drafts as the source).
   */
  skipLocalization?: boolean;
  /** Full edited drafts from the Stage 6b ReviewPanel (multi-draft support) */
  editedDrafts?: import('./document.types').DocumentDraft[];
  /** IDs of post-edit review comments the user accepted */
  acceptedCommentIds?: string[];
}

export interface HumanLocalizeSubmitPayload {
  projectId: string;
  editedLocalizedDrafts: import('./document.types').DocumentDraft[];
  acceptedCommentIds: string[];
}

export interface HumanDitaSubmitPayload {
  projectId: string;
  /** Edited DITA XML documents (raw XML stored as DocumentDraft.content) */
  editedDitaDocuments: import('./document.types').DocumentDraft[];
  acceptedCommentIds: string[];
}

export interface ReviewContinuePayload {
  projectId: string;
  /** The review stage being continued from */
  stage: import('./workflow.types').StageName;
  /** Optional edited drafts to apply before continuing (e.g. review_draft AI edits) */
  editedDrafts?: import('./document.types').DocumentDraft[];
  /** Optional edited parsed-file output from review_upload. */
  editedInputFiles?: import('./document.types').UploadedFile[];
  /** Optional edited analysis output from review_analyze. */
  editedAnalysisResults?: import('./document.types').AnalysisResult[];
  /** Optional edited cross-file synthesis from review_analyze. */
  editedAnalysisSynthesisMarkdown?: string;
  /** Optional edited reference list from review_analyze. */
  editedReferenceSearchResults?: import('./document.types').SearchResult[];
  /** Optional edited localized drafts from review_localize. */
  editedLocalizedDrafts?: import('./document.types').DocumentDraft[];
  /** Optional edited DITA documents from review_dita. */
  editedDitaDocuments?: import('./document.types').DocumentDraft[];
  /** Optional human-confirmed glossary hits from review_analyze (P3). */
  editedGlossaryHits?: import('./glossary.types').GlossaryHit[];
}

export interface AiEditDraftPayload {
  projectId: string;
  /** The current draft content (Markdown) to be edited */
  currentContent: string;
  /** The user's natural-language edit instruction for the AI */
  instruction: string;
}

/** Formats supported by the human ↔ AI artifact editor. */
export type AiArtifactFormat = 'text' | 'markdown' | 'xml' | 'json';

/** Request to revise the current output artifact according to a human instruction. */
export interface AiEditArtifactPayload {
  currentContent: string;
  instruction: string;
  format: AiArtifactFormat;
}

export interface WorkflowAiEditArtifactPayload extends AiEditArtifactPayload {
  projectId: string;
  /** Human checkpoint that owns the artifact; used for stream/log attribution. */
  stage?: import('./workflow.types').StageName;
}

// ── Section split export (S2/S3, design §3.6) ───────────────────────────────

/** One section row in the split preview modal. */
export interface SplitSectionSummary {
  index: number;
  title: string;
  fileName: string;
  chars: number;
}

export interface SplitPreviewResult {
  docTitle: string;
  sections: SplitSectionSummary[];
  warnings: string[];
}

export type SplitExportFormat = 'dita' | 'docx';
export type IncludeIntroMode = 'none' | 'first' | 'all';

export interface SplitExportOptions {
  /** 1-based indices of the sections to export (as returned by the preview). */
  selected: number[];
  formats: SplitExportFormat[];
  includeIntro: IncludeIntroMode;
  createMap: boolean;
  titleFromSection: boolean;
  /** Also copy the complete (unsplit) document into the chosen folder. */
  includeFull?: boolean;
}

export interface SplitExportFileResult {
  fileName: string;
  format: SplitExportFormat;
  valid: boolean;
  errors?: string[];
}

/** A complete (unsplit) file copied alongside the section files. */
export interface SplitExportFullFile {
  fileName: string;
  format: string;
}

export interface SplitExportResult {
  destDir: string;
  files: SplitExportFileResult[];
  /** Complete files copied when `includeFull` was requested. */
  fullFiles?: SplitExportFullFile[];
  warnings: string[];
}

/** `file:splitPreview` payload. */
export interface SplitPreviewPayload {
  projectId: string;
  /** DITA document id (DocumentDraft.id) from the workflow state. */
  documentId: string;
}

/** `file:splitExport` payload. */
export interface SplitExportPayload extends SplitPreviewPayload {
  options: SplitExportOptions;
}

/**
 * `file:exportBundle` payload — exports the complete document **and** the
 * per-section split files with a single folder dialog (single-document export
 * flow in `OutputPanel`).
 */
export interface ExportBundlePayload {
  projectId: string;
  documentId: string;
  /** Split options; defaults to every section as DITA when omitted. */
  split?: SplitExportOptions;
}

export interface ExportBundleResult {
  /** Directory the complete files were copied to. */
  destDir: string;
  fullFiles: SplitExportFullFile[];
  /** Sub-directory receiving the section files (`null` when there are none). */
  splitDir: string | null;
  splitFiles: SplitExportFileResult[];
  warnings: string[];
}

/**
 * `file:downloadZip` result. The archive always contains the complete
 * `.dita` / `.docx` files; when the document can be split it also contains one
 * `<Title>_sections/` folder per document with the per-section `.dita` files
 * and a `.ditamap` linking them.
 */
export interface DownloadZipResult {
  filePath: string;
  /** Number of file entries written into the archive. */
  entries: number;
  /** Number of per-section files added to the archive. */
  sectionFiles: number;
  /** Folder names that hold the per-section files. */
  sectionFolders: string[];
}

/** `localize:splitPreview` / `localize:splitExport` payloads (S3-3). */
export interface LocalizeSplitPreviewPayload {
  /** `LocalizationFileResult.exportFileName` of the localized result. */
  exportFileName: string;
}

export interface LocalizeSplitExportPayload extends LocalizeSplitPreviewPayload {
  options: SplitExportOptions;
}

export interface SettingsGetPayload {
  key: string;
}

export interface SettingsSetPayload {
  key: string;
  value: string | number | boolean;
}

/** 应用目录信息（设置页「应用目录」展示用） */
export interface AppPaths {
  /** 应用安装/执行目录 */
  appPath: string;
  /** 用户数据目录（设置、数据库、项目、日志等） */
  userData: string;
  /** SQLite 主数据库文件（smart-tech-writer.db） */
  databasePath: string;
  /** LangGraph 检查点数据库文件（langgraph.db） */
  langgraphDbPath: string;
  /** 项目文件目录（userData/projects） */
  projectsDir: string;
  /** 日志目录 */
  logsDir: string;
}

export interface AppOpenPathPayload {
  /** 要打开的目录或文件路径 */
  targetPath: string;
}

export interface PromptsGetResult {
  catalog: import('./prompts.types').PromptCatalogEntry[];
  overrides: import('./prompts.types').PromptOverrides;
}

export interface PromptsSetPayload {
  overrides: import('./prompts.types').PromptOverrides;
}

// --- Localization (standalone DITA translation feature) ---

export interface LocalizeStartPayload {
  filePaths: string[];
  targetLanguage: import('./document.types').LocalizeLanguage;
}

/** Continue from the review_localize pause into localize_ai_review. */
export interface LocalizeContinuePayload {
  stage: import('./localization.types').LocalizationStage;
  /** Manual edits made during review_localize (id = sourcePath). */
  editedDrafts?: import('./document.types').DocumentDraft[];
}

/** Submit human edits from the human_localize_review pause. */
export interface LocalizeHumanLocalizeSubmitPayload {
  editedDrafts: import('./document.types').DocumentDraft[];
  acceptedCommentIds: string[];
}

/** Submit final human edits from the human_confirm pause. */
export interface LocalizeHumanConfirmSubmitPayload {
  editedDrafts: import('./document.types').DocumentDraft[];
  acceptedCommentIds: string[];
}

/** Go back to an earlier stage (re-run its AI step). */
export interface LocalizeGoBackPayload {
  stage: import('./localization.types').LocalizationStage;
}

/** Per-file progress event (main → renderer). */
export interface LocalizeProgressEvent {
  stage: import('./localization.types').LocalizationStage;
  fileName: string;
  index: number;
  total: number;
  status: 'started' | 'done' | 'failed';
  message?: string;
}

/** AI stream delta for a file (main → renderer). */
export interface LocalizeStreamEvent {
  fileName: string;
  chunk: {
    type: 'thinking' | 'content';
    text: string;
  };
}

export interface LocalizeStatusResult {
  status: import('./localization.types').LocalizationStatus;
  stage: import('./localization.types').LocalizationStage;
  results: import('./localization.types').LocalizationFileResult[];
}

// --- Translation mapping (glossary) management ---

export interface MappingListPayload {
  /** Optional free-text search across English / 简体中文 / 繁體中文. */
  search?: string;
  /** Server-side pagination offset. */
  offset?: number;
  /** Server-side page size. */
  limit?: number;
  /** Optional kind filter (`term` | `phrase`). */
  kind?: import('./mapping.types').GlossaryEntryKind;
}

export interface MappingAddPayload {
  en: string;
  zhCN: string;
  zhTW: string;
  kind?: import('./mapping.types').GlossaryEntryKind;
  /** Forbidden / deprecated wordings (P4-6). */
  doNotUse?: string[];
}

export interface MappingUpdatePayload {
  id: string;
  en: string;
  zhCN: string;
  zhTW: string;
  kind?: import('./mapping.types').GlossaryEntryKind;
  /** Forbidden / deprecated wordings (P4-6). */
  doNotUse?: string[];
}

export interface MappingDeletePayload {
  id: string;
}

/** `mapping:restore` payload — a backup file name (not an arbitrary path). */
export interface MappingRestorePayload {
  fileName: string;
}

/** `mapping:batchUndo` payload. */
export interface MappingBatchUndoPayload {
  batchId: string;
}

/** Shared options for the plan preview and the actual import. */
export interface MappingImportOptionsPayload {
  parseId: string;
  mode: import('./mapping.types').GlossaryImportMode;
  strategy: import('./mapping.types').ConflictStrategy;
  /** Keep the built-in default glossary entries in `replace` mode. */
  keepDefaults: boolean;
  /** Manual column mapping chosen in the preview dialog. */
  columnOverride?: import('./mapping.types').GlossaryColumnOverride;
  /** Workbook sheet to re-parse (0-based). */
  sheetIndex?: number;
}

export type MappingImportPlanPayload = MappingImportOptionsPayload;
export type MappingImportPayload = MappingImportOptionsPayload;
