// Workflow state, stage names, and status enums

export type StageName =
  | 'upload_parse'
  | 'review_upload'
  | 'ingest'
  | 'analyze'
  | 'review_analyze'
  | 'draft'
  | 'review_draft'
  | 'ai_review'
  | 'human_review'
  | 'post_edit_review'
  | 'human_confirm'
  | 'localize'
  | 'review_localize'
  | 'localize_ai_review'
  | 'human_localize_review'
  | 'dita_build'
  | 'review_dita'
  | 'dita_ai_review'
  | 'human_dita_review'
  | 'export';

export type WorkflowStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED:REVIEW_UPLOAD'
  | 'PAUSED:REVIEW_ANALYZE'
  | 'PAUSED:REVIEW_DRAFT'
  | 'PAUSED:HUMAN_REVIEW'
  | 'PAUSED:HUMAN_CONFIRM'
  | 'PAUSED:REVIEW_LOCALIZE'
  | 'PAUSED:HUMAN_LOCALIZE_REVIEW'
  | 'PAUSED:REVIEW_DITA'
  | 'PAUSED:HUMAN_DITA_REVIEW'
  /** User-initiated pause of an in-flight (RUNNING) workflow. */
  | 'PAUSED:USER'
  | 'COMPLETED'
  | 'FAILED';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: WorkflowStatus;
  currentStage: StageName;
}

/** A single log entry emitted during workflow execution */
export interface WorkflowLogEntry {
  id: string;
  timestamp: string;
  stage: StageName;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  detail?: string;
}

export interface DocGenState {
  projectId: string;
  inputFiles: import('./document.types').UploadedFile[];
  analysisResults: import('./document.types').AnalysisResult[];
  referenceSearchResults: import('./document.types').SearchResult[];
  drafts: import('./document.types').DocumentDraft[];
  aiReviewComments: import('./document.types').ReviewComment[];
  humanEdits: string;
  /**
   * Per-draft human edits from the review stages (multi-draft support, M1).
   * Forward stages use these instead of `drafts` when present; go-back to a
   * stage at/before human_review replays a checkpoint without them, so the
   * original drafts are shown again.
   */
  humanEditedDrafts: import('./document.types').DocumentDraft[];
  postEditReviewComments: import('./document.types').ReviewComment[];
  localizedDrafts: import('./document.types').DocumentDraft[];
  localizeReviewComments: import('./document.types').ReviewComment[];
  /** DITA XML documents generated from localized drafts (raw XML text stored as DocumentDraft.content) */
  ditaDocuments: import('./document.types').DocumentDraft[];
  /** AI review comments on generated DITA XML */
  ditaReviewComments: import('./document.types').ReviewComment[];
  outputDocuments: import('./document.types').OutputDocument[];
  /** Combined structured context produced by the ingest stage (M7). */
  ingestContext: string;
  /** Target language for localization stage */
  targetLanguage: import('./document.types').LocalizeLanguage;
  /**
   * When true, the localization stages (localize / review_localize /
   * localize_ai_review / human_localize_review) are skipped and the pipeline
   * jumps directly from human_confirm to dita_build, building DITA from the
   * (possibly human-edited) English drafts.
   */
  skipLocalization: boolean;
  /** Accumulated workflow logs */
  workflowLogs: WorkflowLogEntry[];
  currentStage: StageName;
  status: WorkflowStatus;
  error?: string;
  /** Monotonically increasing counter to detect stale pipeline runs after go-back */
  pipelineRunId: number;
}
