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
  /** Cross-file relationships, conflicts, dependencies and conclusions in Markdown. */
  analysisSynthesisMarkdown: string;
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
  /** @deprecated Retained only for persisted-state compatibility; Gen Doc no longer runs post-edit review. */
  postEditReviewComments: import('./document.types').ReviewComment[];
  /** @deprecated Localization is a standalone workflow, not a Gen Doc stage. */
  localizedDrafts: import('./document.types').DocumentDraft[];
  /** @deprecated Localization is a standalone workflow, not a Gen Doc stage. */
  localizeReviewComments: import('./document.types').ReviewComment[];
  /** DITA XML documents generated from localized drafts (raw XML text stored as DocumentDraft.content) */
  ditaDocuments: import('./document.types').DocumentDraft[];
  /** AI review comments on generated DITA XML */
  ditaReviewComments: import('./document.types').ReviewComment[];
  outputDocuments: import('./document.types').OutputDocument[];
  /** Combined structured context produced by the ingest stage (M7). */
  ingestContext: string;
  /** @deprecated Retained for persisted-state compatibility; use the standalone localization run state. */
  targetLanguage: import('./document.types').LocalizeLanguage;
  /**
   * 文档大纲：文档撰写阶段的章节结构（可自定义，不再固定模板）。
   * 未设置时使用默认 6 章节大纲。
   */
  documentOutline: import('./document.types').DocumentOutline;
  /**
   * 全局解析提示词：上传 & 解析阶段用户输入的解析思路 / 重点 / 分析设计，
   * 会注入到文件解析 Agent 与 map-reduce 摘要的提示词中。
   * 单文件可通过 UploadedFile.parseInstruction 覆盖。
   */
  parseInstruction?: string;
  /** @deprecated Retained for persisted-state compatibility; Gen Doc always builds DITA from reviewed drafts. */
  skipLocalization: boolean;
  /**
   * Project-level glossary switch (P3). The global switch lives in
   * `GlossarySettings.enabled`; this one lets a single project opt out.
   * Missing on older persisted states → treated as enabled.
   */
  useGlossary?: boolean;
  /** Glossary index version used for the last analysis (P3). */
  glossaryVersion?: number;
  /** Tiered glossary hits resolved from the source material (P3, design §2.5.8). */
  glossaryHits?: import('./glossary.types').GlossaryHit[];
  /** Accumulated workflow logs */
  workflowLogs: WorkflowLogEntry[];
  currentStage: StageName;
  status: WorkflowStatus;
  error?: string;
  /** Monotonically increasing counter to detect stale pipeline runs after go-back */
  pipelineRunId: number;
}
