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
  AppPaths,
  LocalizeStartPayload,
  LocalizeProgressEvent,
  LocalizeStreamEvent,
  LocalizeStatusResult,
  LocalizeContinuePayload,
  LocalizeHumanLocalizeSubmitPayload,
  LocalizeHumanConfirmSubmitPayload,
  LocalizeGoBackPayload,
} from '../shared/types/ipc.types';
import type { DocGenState } from '../shared/types/workflow.types';
import type { Project } from '../shared/types/workflow.types';
import type { StageName } from '../shared/types/workflow.types';
import type { SearchResult } from '../shared/types/document.types';
import type { LocalizeRun, LocalizeRunState } from '../shared/types/localization.types';
import type {
  TranslationMapping,
  MappingImportResult,
  MappingStats,
  MappingImportParseResult,
} from '../shared/types/mapping.types';
import type {
  MappingListPayload,
  MappingAddPayload,
  MappingUpdatePayload,
  MappingDeletePayload,
  MappingImportPayload,
} from '../shared/types/ipc.types';
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
  app: {
    getVersion(): Promise<string>;
    getPaths(): Promise<AppPaths>;
    openPath(targetPath: string): Promise<void>;
  };
  prompts: {
    get(): Promise<import('../shared/types/ipc.types').PromptsGetResult>;
    set(overrides: import('../shared/types/prompts.types').PromptOverrides): Promise<void>;
    reset(): Promise<void>;
  };
  projects: {
    list(): Promise<Project[]>;
    get(projectId: string): Promise<Project | null>;
    getState(projectId: string): Promise<DocGenState | null>;
    delete(projectId: string): Promise<void>;
  };
  localization: {
    selectFiles(): Promise<string[]>;
    start(payload: LocalizeStartPayload): Promise<void>;
    getStatus(): Promise<LocalizeStatusResult>;
    exportTo(): Promise<{ destDir: string; count: number } | null>;
    continue(payload: LocalizeContinuePayload): Promise<void>;
    submitHumanLocalizeReview(payload: LocalizeHumanLocalizeSubmitPayload): Promise<void>;
    submitHumanConfirm(payload: LocalizeHumanConfirmSubmitPayload): Promise<void>;
    goBack(payload: LocalizeGoBackPayload): Promise<void>;
    listRuns(): Promise<LocalizeRun[]>;
    getRun(runId: string): Promise<LocalizeRunState | null>;
    deleteRun(runId: string): Promise<void>;
    loadRun(runId: string): Promise<LocalizeRunState | null>;
    onProgress(callback: (event: LocalizeProgressEvent) => void): () => void;
    onStream(callback: (event: LocalizeStreamEvent) => void): () => void;
  };
  mapping: {
    list(payload: MappingListPayload): Promise<TranslationMapping[]>;
    add(payload: MappingAddPayload): Promise<TranslationMapping | null>;
    update(payload: MappingUpdatePayload): Promise<TranslationMapping | null>;
    delete(payload: MappingDeletePayload): Promise<void>;
    importParse(): Promise<MappingImportParseResult | null>;
    import(payload: MappingImportPayload): Promise<MappingImportResult>;
    stats(): Promise<MappingStats>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
