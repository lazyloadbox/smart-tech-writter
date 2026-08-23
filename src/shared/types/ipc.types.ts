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
  // File
  FILE_SELECT: 'file:select',
  FILE_READ: 'file:read',
  FILE_SAVE_DITA: 'file:saveDita',
  FILE_EXPORT_ALL: 'file:exportAll',
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
  LOCALIZE_GO_BACK: 'localize:goBack',
  // Localization run history (persisted runs)
  LOCALIZE_RUNS_LIST: 'localize:runsList',
  LOCALIZE_RUNS_GET: 'localize:runsGet',
  LOCALIZE_RUNS_DELETE: 'localize:runsDelete',
  LOCALIZE_RUNS_LOAD: 'localize:runsLoad',
  // Translation mapping (glossary) management
  MAPPING_LIST: 'mapping:list',
  MAPPING_ADD: 'mapping:add',
  MAPPING_UPDATE: 'mapping:update',
  MAPPING_DELETE: 'mapping:delete',
  MAPPING_IMPORT_PARSE: 'mapping:importParse',
  MAPPING_IMPORT: 'mapping:import',
  MAPPING_STATS: 'mapping:stats',
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
}

export interface AiEditDraftPayload {
  projectId: string;
  /** The current draft content (Markdown) to be edited */
  currentContent: string;
  /** The user's natural-language edit instruction for the AI */
  instruction: string;
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
}

export interface MappingAddPayload {
  en: string;
  zhCN: string;
  zhTW: string;
}

export interface MappingUpdatePayload {
  id: string;
  en: string;
  zhCN: string;
  zhTW: string;
}

export interface MappingDeletePayload {
  id: string;
}

/** Result of parsing an import file (before the user confirms the import). */
export interface MappingImportParseResult {
  fileName: string;
  rows: import('./mapping.types').MappingImportRow[];
}

export interface MappingImportPayload {
  rows: import('./mapping.types').MappingImportRow[];
}
