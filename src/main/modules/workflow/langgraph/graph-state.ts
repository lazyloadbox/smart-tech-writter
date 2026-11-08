import { Annotation } from '@langchain/langgraph';
import type { StageName, WorkflowStatus } from '../../../../shared/types/workflow.types';
import type {
  UploadedFile,
  AnalysisResult,
  SearchResult,
  DocumentDraft,
  ReviewComment,
  OutputDocument,
  LocalizeLanguage,
  DocumentOutline,
} from '../../../../shared/types/document.types';
import type { GlossaryHit } from '../../../../shared/types/glossary.types';

/**
 * LangGraph state schema for the document-generation workflow.
 *
 * Mirrors `DocGenState` minus the fields owned by the WorkflowEngine facade
 * (`workflowLogs`, `error`, `pipelineRunId`). All channels use default
 * overwrite semantics — each node's returned value replaces the channel,
 * matching the old `{ ...state, ...updates }` merge behavior.
 */
export const WorkflowStateAnnotation = Annotation.Root({
  projectId: Annotation<string>,
  inputFiles: Annotation<UploadedFile[]>,
  analysisResults: Annotation<AnalysisResult[]>,
  analysisSynthesisMarkdown: Annotation<string>,
  referenceSearchResults: Annotation<SearchResult[]>,
  drafts: Annotation<DocumentDraft[]>,
  aiReviewComments: Annotation<ReviewComment[]>,
  humanEdits: Annotation<string>,
  humanEditedDrafts: Annotation<DocumentDraft[]>,
  postEditReviewComments: Annotation<ReviewComment[]>,
  localizedDrafts: Annotation<DocumentDraft[]>,
  localizeReviewComments: Annotation<ReviewComment[]>,
  ditaDocuments: Annotation<DocumentDraft[]>,
  ditaReviewComments: Annotation<ReviewComment[]>,
  outputDocuments: Annotation<OutputDocument[]>,
  ingestContext: Annotation<string>,
  targetLanguage: Annotation<LocalizeLanguage>,
  documentOutline: Annotation<DocumentOutline>,
  parseInstruction: Annotation<string>,
  skipLocalization: Annotation<boolean>,
  /** Project-level glossary switch (P3); missing means enabled. */
  useGlossary: Annotation<boolean>,
  /** Glossary index version the hits were resolved against (P3). */
  glossaryVersion: Annotation<number>,
  /** Tiered glossary hits resolved during `analyze` (P3). */
  glossaryHits: Annotation<GlossaryHit[]>,
  currentStage: Annotation<StageName>,
  status: Annotation<WorkflowStatus>,
});

export type WorkflowGraphState = typeof WorkflowStateAnnotation.State;
