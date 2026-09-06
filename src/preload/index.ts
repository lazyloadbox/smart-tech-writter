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
    import: (payload: import('../shared/types/ipc.types').MappingImportPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_IMPORT, payload),
    stats: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MAPPING_STATS),
  },
});
