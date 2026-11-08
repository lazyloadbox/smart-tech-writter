import type {
  WorkflowStartPayload,
  HumanReviewSubmitPayload,
  HumanConfirmSubmitPayload,
  HumanLocalizeSubmitPayload,
  HumanDitaSubmitPayload,
  ReviewContinuePayload,
  AiEditDraftPayload,
  WorkflowAiEditArtifactPayload,
  AiEditArtifactPayload,
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
  MappingListResult,
  MappingImportResult,
  MappingImportPlanResult,
  MappingStats,
  MappingImportParseResult,
  GlossaryBackupInfo,
  GlossaryBatchUndoResult,
  GlossaryImportBatchInfo,
  GlossaryRestoreResult,
} from '../shared/types/mapping.types';
import type {
  MappingListPayload,
  MappingAddPayload,
  MappingUpdatePayload,
  MappingDeletePayload,
  MappingImportPayload,
  MappingImportPlanPayload,
  MappingRestorePayload,
  MappingBatchUndoPayload,
} from '../shared/types/ipc.types';
import type {
  GlossaryIndexStatus,
  GlossarySettings,
  GlossaryTestMatchPayload,
  GlossaryTestMatchResult,
  GlossaryEmbeddingProgress,
  GlossaryModelInstallOutcome,
  GlossaryModelProgress,
  GlossaryModelStatus,
  GlossaryUsageReport,
  GlossaryUsageReportPayload,
} from '../shared/types/glossary.types';
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
    aiEditArtifact(payload: WorkflowAiEditArtifactPayload): Promise<string>;
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
    downloadZip(projectId: string): Promise<import('../shared/types/ipc.types').DownloadZipResult | null>;
    saveDita(filePath: string, fileName: string, format?: string): Promise<string | null>;
    exportAll(projectId: string): Promise<string | null>;
    exportBundle(payload: import('../shared/types/ipc.types').ExportBundlePayload): Promise<import('../shared/types/ipc.types').ExportBundleResult | null>;
    splitPreview(payload: import('../shared/types/ipc.types').SplitPreviewPayload): Promise<import('../shared/types/ipc.types').SplitPreviewResult | null>;
    splitExport(payload: import('../shared/types/ipc.types').SplitExportPayload): Promise<import('../shared/types/ipc.types').SplitExportResult | null>;
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
    aiEditArtifact(payload: AiEditArtifactPayload): Promise<string>;
    goBack(payload: LocalizeGoBackPayload): Promise<void>;
    listRuns(): Promise<LocalizeRun[]>;
    getRun(runId: string): Promise<LocalizeRunState | null>;
    deleteRun(runId: string): Promise<void>;
    loadRun(runId: string): Promise<LocalizeRunState | null>;
    splitPreview(payload: import('../shared/types/ipc.types').LocalizeSplitPreviewPayload): Promise<import('../shared/types/ipc.types').SplitPreviewResult | null>;
    splitExport(payload: import('../shared/types/ipc.types').LocalizeSplitExportPayload): Promise<import('../shared/types/ipc.types').SplitExportResult | null>;
    onProgress(callback: (event: LocalizeProgressEvent) => void): () => void;
    onStream(callback: (event: LocalizeStreamEvent) => void): () => void;
  };
  mapping: {
    list(payload: MappingListPayload): Promise<MappingListResult>;
    add(payload: MappingAddPayload): Promise<TranslationMapping | null>;
    update(payload: MappingUpdatePayload): Promise<TranslationMapping | null>;
    delete(payload: MappingDeletePayload): Promise<void>;
    importParse(): Promise<MappingImportParseResult | null>;
    importPlan(payload: MappingImportPlanPayload): Promise<MappingImportPlanResult>;
    import(payload: MappingImportPayload): Promise<MappingImportResult>;
    export(): Promise<string | null>;
    stats(): Promise<MappingStats>;
    /** P4-1: glossary backups. */
    backups(): Promise<{ items: GlossaryBackupInfo[] }>;
    restore(payload: MappingRestorePayload): Promise<GlossaryRestoreResult>;
    /** P4-2: import batch audit + undo. */
    batches(): Promise<{ items: GlossaryImportBatchInfo[] }>;
    batchUndo(payload: MappingBatchUndoPayload): Promise<GlossaryBatchUndoResult>;
  };
  glossary: {
    getSettings(): Promise<GlossarySettings>;
    setSettings(payload: Partial<GlossarySettings>): Promise<GlossarySettings>;
    indexStatus(): Promise<GlossaryIndexStatus>;
    testMatch(payload: GlossaryTestMatchPayload): Promise<GlossaryTestMatchResult>;
    /** Batch entry lookup for the glossary hit panel (P3). */
    entries(ids: string[]): Promise<import('../shared/types/glossary.types').GlossaryEntryView[]>;
    /** P4-4: pre-export terminology usage report. */
    usageReport(payload: GlossaryUsageReportPayload): Promise<GlossaryUsageReport>;
    modelDownload(payload?: { sourceIndex?: number }): Promise<GlossaryModelStatus>;
    modelCancel(): Promise<GlossaryModelStatus>;
    modelInstallPackage(): Promise<GlossaryModelInstallOutcome>;
    modelInstallFolder(): Promise<GlossaryModelInstallOutcome>;
    modelConfirmCustom(): Promise<GlossaryModelInstallOutcome>;
    modelExportPackage(): Promise<{ status: 'exported' | 'cancelled'; path?: string; files?: number }>;
    modelVerify(): Promise<GlossaryModelStatus>;
    modelRetry(): Promise<GlossaryModelStatus>;
    modelRemove(): Promise<GlossaryModelStatus>;
    modelClearNativeFailure(): Promise<GlossaryModelStatus>;
    embeddingStart(): Promise<GlossaryEmbeddingProgress>;
    embeddingPause(): Promise<GlossaryEmbeddingProgress>;
    onModelProgress(cb: (progress: GlossaryModelProgress) => void): () => void;
    onEmbeddingProgress(cb: (progress: GlossaryEmbeddingProgress) => void): () => void;
    onStatusChanged(cb: (status: GlossaryModelStatus) => void): () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
