import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types/ipc.types';
import type {
  WorkflowStartPayload,
  HumanReviewSubmitPayload,
  HumanConfirmSubmitPayload,
  HumanLocalizeSubmitPayload,
  HumanDitaSubmitPayload,
  WorkflowProgressEvent,
  WorkflowGoBackPayload,
  WorkflowStreamEvent,
  SettingsSetPayload,
} from '../shared/types/ipc.types';

contextBridge.exposeInMainWorld('electronAPI', {
  workflow: {
    start: (payload: WorkflowStartPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_START, payload),
    pause: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_PAUSE, { projectId }),
    resume: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_RESUME, { projectId }),
    getStatus: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_STATUS, { projectId }),
    goBack: (payload: WorkflowGoBackPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_GO_BACK, payload),
    submitHumanReview: (payload: HumanReviewSubmitPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_HUMAN_REVIEW_SUBMIT, payload),
    submitHumanConfirm: (payload: HumanConfirmSubmitPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_HUMAN_CONFIRM_SUBMIT, payload),
    submitHumanLocalize: (payload: HumanLocalizeSubmitPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_HUMAN_LOCALIZE_SUBMIT, payload),
    submitHumanDita: (payload: HumanDitaSubmitPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_HUMAN_DITA_SUBMIT, payload),
    reviewContinue: (payload: import('../shared/types/ipc.types').ReviewContinuePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_REVIEW_CONTINUE, payload),
    aiEditDraft: (payload: import('../shared/types/ipc.types').AiEditDraftPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_AI_EDIT_DRAFT, payload),
    aiEditArtifact: (payload: import('../shared/types/ipc.types').WorkflowAiEditArtifactPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKFLOW_AI_EDIT_ARTIFACT, payload),
    onProgress: (callback: (event: WorkflowProgressEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: WorkflowProgressEvent) =>
        callback(data);
      ipcRenderer.on(IPC_CHANNELS.WORKFLOW_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WORKFLOW_PROGRESS, handler);
    },
    onStream: (callback: (event: WorkflowStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: WorkflowStreamEvent) =>
        callback(data);
      ipcRenderer.on(IPC_CHANNELS.WORKFLOW_STREAM, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WORKFLOW_STREAM, handler);
    },
  },
  file: {
    selectFiles: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_SELECT),
    readFile: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, { filePath }),
    showInFolder: (filePath: string) =>
      ipcRenderer.invoke('file:showInFolder', { filePath }),
    downloadZip: (projectId: string) =>
      ipcRenderer.invoke('file:downloadZip', { projectId }),
    saveDita: (filePath: string, fileName: string, format?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_DITA, { filePath, fileName, format }),
    exportAll: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_ALL, { projectId }),
    exportBundle: (payload: import('../shared/types/ipc.types').ExportBundlePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_BUNDLE, payload),
    splitPreview: (payload: import('../shared/types/ipc.types').SplitPreviewPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SPLIT_PREVIEW, payload),
    splitExport: (payload: import('../shared/types/ipc.types').SplitExportPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SPLIT_EXPORT, payload),
  },
  rag: {
    query: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_QUERY, { query }),
    addDocument: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_ADD_DOCUMENT, { filePath }),
    removeDocument: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_REMOVE_DOCUMENT, { filePath }),
    clearIndex: () =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_CLEAR_INDEX),
    indexStats: () =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_INDEX_STATS),
  },
  settings: {
    get: (key: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key } as import('../shared/types/ipc.types').SettingsGetPayload),
    set: (payload: SettingsSetPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, payload),
    reloadProvider: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RELOAD_PROVIDER),
  },
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    getPaths: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PATHS),
    openPath: (targetPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_PATH, { targetPath }),
  },
  prompts: {
    get: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_GET),
    set: (overrides: import('../shared/types/prompts.types').PromptOverrides) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_SET, { overrides }),
    reset: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPTS_RESET),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    get: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_GET, { projectId }),
    getState: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_GET_STATE, { projectId }),
    delete: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, { projectId }),
  },
  localization: {
    selectFiles: () => ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_SELECT_FILES),
    start: (payload: import('../shared/types/ipc.types').LocalizeStartPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_START, payload),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_STATUS),
    exportTo: () => ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_EXPORT),
    continue: (payload: import('../shared/types/ipc.types').LocalizeContinuePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_CONTINUE, payload),
    submitHumanLocalizeReview: (payload: import('../shared/types/ipc.types').LocalizeHumanLocalizeSubmitPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_HUMAN_LOCALIZE_SUBMIT, payload),
    submitHumanConfirm: (payload: import('../shared/types/ipc.types').LocalizeHumanConfirmSubmitPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_HUMAN_CONFIRM_SUBMIT, payload),
    aiEditArtifact: (payload: import('../shared/types/ipc.types').AiEditArtifactPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_AI_EDIT_ARTIFACT, payload),
    goBack: (payload: import('../shared/types/ipc.types').LocalizeGoBackPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_GO_BACK, payload),
    listRuns: () => ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_RUNS_LIST),
    getRun: (runId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_RUNS_GET, { runId }),
    deleteRun: (runId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_RUNS_DELETE, { runId }),
    loadRun: (runId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_RUNS_LOAD, { runId }),
    splitPreview: (payload: import('../shared/types/ipc.types').LocalizeSplitPreviewPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_SPLIT_PREVIEW, payload),
    splitExport: (payload: import('../shared/types/ipc.types').LocalizeSplitExportPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCALIZE_SPLIT_EXPORT, payload),
    onProgress: (callback: (event: import('../shared/types/ipc.types').LocalizeProgressEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: import('../shared/types/ipc.types').LocalizeProgressEvent) =>
        callback(data);
      ipcRenderer.on(IPC_CHANNELS.LOCALIZE_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LOCALIZE_PROGRESS, handler);
    },
    onStream: (callback: (event: import('../shared/types/ipc.types').LocalizeStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: import('../shared/types/ipc.types').LocalizeStreamEvent) =>
        callback(data);
      ipcRenderer.on(IPC_CHANNELS.LOCALIZE_STREAM, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LOCALIZE_STREAM, handler);
    },
  },
  mapping: {
    list: (payload: import('../shared/types/ipc.types').MappingListPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_LIST, payload),
    add: (payload: import('../shared/types/ipc.types').MappingAddPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_ADD, payload),
    update: (payload: import('../shared/types/ipc.types').MappingUpdatePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_UPDATE, payload),
    delete: (payload: import('../shared/types/ipc.types').MappingDeletePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_DELETE, payload),
    importParse: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_IMPORT_PARSE),
    importPlan: (payload: import('../shared/types/ipc.types').MappingImportPlanPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_IMPORT_PLAN, payload),
    import: (payload: import('../shared/types/ipc.types').MappingImportPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_IMPORT, payload),
    export: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_EXPORT),
    stats: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_STATS),
    backups: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_BACKUPS),
    restore: (payload: import('../shared/types/ipc.types').MappingRestorePayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_RESTORE, payload),
    batches: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_BATCHES),
    batchUndo: (payload: import('../shared/types/ipc.types').MappingBatchUndoPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_BATCH_UNDO, payload),
  },
  glossary: {
    getSettings: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_GET_SETTINGS),
    setSettings: (payload: Partial<import('../shared/types/glossary.types').GlossarySettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_SET_SETTINGS, payload),
    indexStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_INDEX_STATUS),
    testMatch: (payload: import('../shared/types/glossary.types').GlossaryTestMatchPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_TEST_MATCH, payload),
    entries: (ids: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_ENTRIES, { ids }),
    usageReport: (payload: import('../shared/types/glossary.types').GlossaryUsageReportPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_USAGE_REPORT, payload),
    // ── Semantic model management (P2b) ──
    modelDownload: (payload?: { sourceIndex?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_DOWNLOAD, payload),
    modelCancel: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_CANCEL),
    modelInstallPackage: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_INSTALL_PACKAGE),
    modelInstallFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_INSTALL_FOLDER),
    modelConfirmCustom: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_CONFIRM_CUSTOM),
    modelExportPackage: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_EXPORT_PACKAGE),
    modelVerify: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_VERIFY),
    modelRetry: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_RETRY),
    modelRemove: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_REMOVE),
    modelClearNativeFailure: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_MODEL_CLEAR_NATIVE),
    embeddingStart: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_EMBEDDING_START),
    embeddingPause: () =>
      ipcRenderer.invoke(IPC_CHANNELS.GLOSSARY_EMBEDDING_PAUSE),
    onModelProgress: (cb: (progress: import('../shared/types/glossary.types').GlossaryModelProgress) => void) => {
      const listener = (_event: unknown, progress: import('../shared/types/glossary.types').GlossaryModelProgress) => cb(progress);
      ipcRenderer.on(IPC_CHANNELS.GLOSSARY_MODEL_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.GLOSSARY_MODEL_PROGRESS, listener);
    },
    onEmbeddingProgress: (cb: (progress: import('../shared/types/glossary.types').GlossaryEmbeddingProgress) => void) => {
      const listener = (_event: unknown, progress: import('../shared/types/glossary.types').GlossaryEmbeddingProgress) => cb(progress);
      ipcRenderer.on(IPC_CHANNELS.GLOSSARY_EMBEDDING_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.GLOSSARY_EMBEDDING_PROGRESS, listener);
    },
    onStatusChanged: (cb: (status: import('../shared/types/glossary.types').GlossaryModelStatus) => void) => {
      const listener = (_event: unknown, status: import('../shared/types/glossary.types').GlossaryModelStatus) => cb(status);
      ipcRenderer.on(IPC_CHANNELS.GLOSSARY_INDEX_STATUS, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.GLOSSARY_INDEX_STATUS, listener);
    },
  },
});
