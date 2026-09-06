import { create } from 'zustand';
import type { DocGenState, StageName, WorkflowStatus, WorkflowLogEntry } from '../../shared/types/workflow.types';
import type { UploadedFile, AnalysisResult, DocumentDraft, ReviewComment, OutputDocument, SearchResult, LocalizeLanguage, DocumentOutline } from '../../shared/types/document.types';

interface StreamChunk {
  stage: StageName;
  /** `thinking` = reasoning_content (model's thinking), `content` = visible output. */
  type: 'thinking' | 'content';
  content: string;
  timestamp: string;
}

interface WorkflowStore extends DocGenState {
  setProjectId: (id: string) => void;
  setInputFiles: (files: UploadedFile[]) => void;
  setState: (partial: Partial<DocGenState>) => void;
  /** Append log entries to the accumulated log */
  appendLogs: (entries: WorkflowLogEntry[]) => void;
  /** Set target language for localization */
  setTargetLanguage: (lang: LocalizeLanguage) => void;
  reset: () => void;
  // --- Streaming support ---
  /** Accumulated AI stream chunks */
  streamChunks: StreamChunk[];
  /** Append a typed stream chunk ({ type, text }) */
  appendStreamChunk: (stage: StageName, chunk: { type: 'thinking' | 'content'; text: string }) => void;
  /** Clear stream chunks (e.g., on stage transition) */
  clearStreamChunks: () => void;
  // --- Progress message ---
  /** Latest progress message from the backend (e.g. current file being processed) */
  currentProgressMessage: string;
  /** Set the current progress message */
  setProgressMessage: (msg: string) => void;
}

const initialState: DocGenState = {
  projectId: '',
  inputFiles: [],
  analysisResults: [],
  analysisSynthesisMarkdown: '',
  referenceSearchResults: [],
  drafts: [],
  aiReviewComments: [],
  humanEdits: '',
  humanEditedDrafts: [],
  postEditReviewComments: [],
  localizedDrafts: [],
  localizeReviewComments: [],
  ditaDocuments: [],
  ditaReviewComments: [],
  outputDocuments: [],
  ingestContext: '',
  targetLanguage: 'zh-CN',
  documentOutline: {
    sections: [
      'Executive Summary',
      'Product/Feature Overview',
      'Technical Specifications',
      'Key Features and Functions',
      'Requirements and Dependencies',
      'Implementation Notes',
    ],
    mergeIntoSingle: true,
  },
  skipLocalization: true,
  workflowLogs: [],
  currentStage: 'upload_parse',
  status: 'IDLE',
  pipelineRunId: 0,
};

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  ...initialState,
  streamChunks: [],
  currentProgressMessage: '',
  setProjectId: (id) => set({ projectId: id }),
  setInputFiles: (files) => set({ inputFiles: files }),
  setState: (partial) => set((s) => ({ ...s, ...partial })),
  appendLogs: (entries) =>
    set((s) => ({ workflowLogs: [...s.workflowLogs, ...entries] })),
  setTargetLanguage: (lang) => set({ targetLanguage: lang }),
  reset: () => set({ ...initialState, streamChunks: [], currentProgressMessage: '' }),
  appendStreamChunk: (stage, chunk) =>
    set((s) => ({
      streamChunks: [
        ...s.streamChunks,
        { stage, type: chunk.type, content: chunk.text, timestamp: new Date().toISOString() },
      ],
    })),
  clearStreamChunks: () => set({ streamChunks: [] }),
  setProgressMessage: (msg) => set({ currentProgressMessage: msg }),
}));
