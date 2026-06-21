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
    saveDita: (filePath: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_DITA, { filePath, fileName }),
    exportAll: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_ALL, { projectId }),
  },
  rag: {
    query: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_QUERY, { query }),
    addDocument: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RAG_ADD_DOCUMENT, { filePath }),
  },
  settings: {
    get: (key: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key } as import('../shared/types/ipc.types').SettingsGetPayload),
    set: (payload: SettingsSetPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, payload),
    reloadProvider: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RELOAD_PROVIDER),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
    get: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_GET, { projectId }),
    delete: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, { projectId }),
  },
});
