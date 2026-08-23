import type {
  WorkflowStartPayload,
  HumanReviewSubmitPayload,
  HumanConfirmSubmitPayload,
  HumanLocalizeSubmitPayload,
  HumanDitaSubmitPayload,
  ReviewContinuePayload,
  AiEditDraftPayload,
  WorkflowProgressEvent,
  WorkflowGoBackPayload,
  WorkflowStreamEvent,
  SettingsGetPayload,
  SettingsSetPayload,
} from '../shared/types/ipc.types';
import type { DocGenState } from '../shared/types/workflow.types';
import type { Project } from '../shared/types/workflow.types';
import type { StageName } from '../shared/types/workflow.types';
import type { SearchResult } from '../shared/types/document.types';
// Types for what the preload exposes on window.electronAPI
export interface ElectronAPI {
  workflow: {
    start(payload: WorkflowStartPayload): Promise<DocGenState>;
    pause(projectId: string): Promise<void>;
    resume(projectId: string): Promise<void>;
    getStatus(projectId: string): Promise<DocGenState>;
    goBack(payload: WorkflowGoBackPayload): Promise<void>;
    submitHumanReview(payload: HumanReviewSubmitPayload): Promise<void>;
    submitHumanConfirm(payload: HumanConfirmSubmitPayload): Promise<void>;
    submitHumanLocalize(payload: HumanLocalizeSubmitPayload): Promise<void>;
    submitHumanDita(payload: HumanDitaSubmitPayload): Promise<void>;
    reviewContinue(payload: ReviewContinuePayload): Promise<void>;
    aiEditDraft(payload: AiEditDraftPayload): Promise<string>;
    onProgress(
      callback: (event: WorkflowProgressEvent) => void
    ): () => void;
    onStream(
      callback: (event: WorkflowStreamEvent) => void
    ): () => void;
  };
  file: {
    selectFiles(): Promise<string[]>;
    readFile(filePath: string): Promise<string>;
    showInFolder(filePath: string): Promise<void>;
    downloadZip(projectId: string): Promise<void>;
    saveDita(filePath: string, fileName: string, format?: string): Promise<string | null>;
    exportAll(projectId: string): Promise<string | null>;
  };
  rag: {
    query(query: string): Promise<SearchResult[]>;
    addDocument(filePath: string): Promise<{ success: boolean; indexedChunks: number; error?: string }>;
    removeDocument(filePath: string): Promise<{ success: boolean }>;
    clearIndex(): Promise<{ success: boolean }>;
    indexStats(): Promise<{ indexedChunks: number }>;
  };
  settings: {
    get(key: string): Promise<string | number | boolean | null>;
    set(payload: SettingsSetPayload): Promise<void>;
    reloadProvider(): Promise<void>;
  };
  projects: {
    list(): Promise<Project[]>;
    get(projectId: string): Promise<Project | null>;
    delete(projectId: string): Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
