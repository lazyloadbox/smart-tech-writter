import type { WorkflowProgressEvent, WorkflowStreamEvent } from '../../shared/types/ipc.types';
import type { DocGenState, StageName } from '../../shared/types/workflow.types';
import { v4 as uuidv4 } from 'uuid';

function wfLog(scope: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.info(`[WF][Renderer][${scope}] ${message}`, data);
    return;
  }
  console.info(`[WF][Renderer][${scope}] ${message}`);
}

function getElectronApi() {
  if (!window.electronAPI) {
    throw new Error('electronAPI is unavailable. Preload script may have failed to load.');
  }
  return window.electronAPI;
}

export const workflowApi = {
  start: async (filePaths: string[]): Promise<DocGenState> => {
    const projectId = uuidv4();
    wfLog('API', 'Sending workflow:start', { projectId, fileCount: filePaths.length, filePaths });
    const state = await getElectronApi().workflow.start({ projectId, filePaths });
    wfLog('API', 'Received workflow:start response', {
      projectId: state.projectId,
      stage: state.currentStage,
      status: state.status,
      inputFileCount: state.inputFiles.length,
    });
    return state;
  },

  getStatus: async (projectId: string) => {
    wfLog('API', 'Sending workflow:status', { projectId });
    const status = await getElectronApi().workflow.getStatus(projectId);
    wfLog('API', 'Received workflow:status response', {
      projectId,
      exists: !!status,
      stage: status?.currentStage,
      status: status?.status,
    });
    return status;
  },

  submitHumanReview: (
    projectId: string,
    editedContent: string,
    acceptedCommentIds: string[]
  ) => {
    wfLog('API', 'Sending workflow:humanReviewSubmit', { projectId, acceptedCount: acceptedCommentIds.length });
    return getElectronApi().workflow.submitHumanReview({
      projectId,
      editedContent,
      acceptedCommentIds,
    });
  },

  submitHumanConfirm: (
    projectId: string,
    approved: boolean,
    targetLanguage?: import('../../shared/types/document.types').LocalizeLanguage,
    editedContent?: string,
    acceptedCommentIds?: string[],
    skipLocalization?: boolean
  ) => {
    wfLog('API', 'Sending workflow:humanConfirmSubmit', {
      projectId,
      approved,
      targetLanguage,
      skipLocalization,
      hasEditedContent: !!editedContent,
      acceptedCount: acceptedCommentIds?.length ?? 0,
    });
    return getElectronApi().workflow.submitHumanConfirm({
      projectId,
      approved,
      targetLanguage,
      skipLocalization,
      editedContent,
      acceptedCommentIds,
    });
  },

  submitHumanLocalize: (
    projectId: string,
    editedLocalizedDrafts: import('../../shared/types/document.types').DocumentDraft[],
    acceptedCommentIds: string[]
  ) => {
    wfLog('API', 'Sending workflow:humanLocalizeSubmit', {
      projectId,
      draftCount: editedLocalizedDrafts.length,
      acceptedCount: acceptedCommentIds.length,
    });
    return getElectronApi().workflow.submitHumanLocalize({
      projectId,
      editedLocalizedDrafts,
      acceptedCommentIds,
    });
  },

  submitHumanDita: (
    projectId: string,
    editedDitaDocuments: import('../../shared/types/document.types').DocumentDraft[],
    acceptedCommentIds: string[]
  ) => {
    wfLog('API', 'Sending workflow:humanDitaSubmit', {
      projectId,
      docCount: editedDitaDocuments.length,
      acceptedCount: acceptedCommentIds.length,
    });
    return getElectronApi().workflow.submitHumanDita({
      projectId,
      editedDitaDocuments,
      acceptedCommentIds,
    });
  },

  onProgress: (cb: (event: WorkflowProgressEvent) => void) =>
    getElectronApi().workflow.onProgress((event) => {
      wfLog('Progress', 'Received workflow progress event', event);
      cb(event);
    }),

  goBack: (projectId: string, targetStage: StageName) => {
    wfLog('API', 'Sending workflow:goBack', { projectId, targetStage });
    return getElectronApi().workflow.goBack({ projectId, targetStage });
  },

  reviewContinue: (projectId: string, stage: StageName, editedDrafts?: import('../../shared/types/document.types').DocumentDraft[]) => {
    wfLog('API', 'Sending workflow:reviewContinue', { projectId, stage, hasEditedDrafts: !!editedDrafts });
    return getElectronApi().workflow.reviewContinue({ projectId, stage, editedDrafts });
  },

  aiEditDraft: (projectId: string, currentContent: string, instruction: string) => {
    wfLog('API', 'Sending workflow:aiEditDraft', { projectId, instructionLen: instruction.length });
    return getElectronApi().workflow.aiEditDraft({ projectId, currentContent, instruction });
  },

  onStream: (cb: (event: WorkflowStreamEvent) => void) =>
    getElectronApi().workflow.onStream((event) => {
      cb(event);
    }),
};
