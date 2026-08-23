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
  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_DELETE: 'projects:delete',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

export interface WorkflowStartPayload {
  projectId: string;
  filePaths: string[];
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
  chunk: string;
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
