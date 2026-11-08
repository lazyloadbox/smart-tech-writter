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
  start: async (
    filePaths: string[],
    documentOutline?: import('../../shared/types/document.types').DocumentOutline,
    parseInstruction?: string,
    fileInstructions?: Record<string, string>,
    useGlossary?: boolean
  ): Promise<DocGenState> => {
    const projectId = uuidv4();
    wfLog('API', 'Sending workflow:start', { projectId, fileCount: filePaths.length, filePaths, useGlossary });
    const state = await getElectronApi().workflow.start({ projectId, filePaths, documentOutline, parseInstruction, fileInstructions, useGlossary });
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

  pause: (projectId: string) => {
    wfLog('API', 'Sending workflow:pause', { projectId });
    return getElectronApi().workflow.pause(projectId);
  },

  resume: (projectId: string) => {
    wfLog('API', 'Sending workflow:resume', { projectId });
    return getElectronApi().workflow.resume(projectId);
  },

  submitHumanReview: (
    projectId: string,
    editedDrafts: import('../../shared/types/document.types').DocumentDraft[],
    acceptedCommentIds: string[]
  ) => {
    wfLog('API', 'Sending workflow:humanReviewSubmit', { projectId, draftCount: editedDrafts.length, acceptedCount: acceptedCommentIds.length });
    return getElectronApi().workflow.submitHumanReview({
      projectId,
      editedDrafts,
      acceptedCommentIds,
    });
  },

  submitHumanConfirm: (
    projectId: string,
    approved: boolean,
    targetLanguage?: import('../../shared/types/document.types').LocalizeLanguage,
    editedDrafts?: import('../../shared/types/document.types').DocumentDraft[],
    acceptedCommentIds?: string[],
    skipLocalization?: boolean
  ) => {
    wfLog('API', 'Sending workflow:humanConfirmSubmit', {
      projectId,
      approved,
      targetLanguage,
      skipLocalization,
      hasEditedDrafts: !!editedDrafts,
      acceptedCount: acceptedCommentIds?.length ?? 0,
    });
    return getElectronApi().workflow.submitHumanConfirm({
      projectId,
      approved,
      targetLanguage,
      skipLocalization,
      editedDrafts,
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

  reviewContinue: (
    projectId: string,
    stage: StageName,
    edits?: Omit<import('../../shared/types/ipc.types').ReviewContinuePayload, 'projectId' | 'stage'>,
  ) => {
    wfLog('API', 'Sending workflow:reviewContinue', { projectId, stage, editedFields: Object.keys(edits ?? {}) });
    return getElectronApi().workflow.reviewContinue({ projectId, stage, ...edits });
  },

  aiEditDraft: (projectId: string, currentContent: string, instruction: string) => {
    wfLog('API', 'Sending workflow:aiEditDraft', { projectId, instructionLen: instruction.length });
    return getElectronApi().workflow.aiEditDraft({ projectId, currentContent, instruction });
  },

  aiEditArtifact: (
    projectId: string,
    currentContent: string,
    instruction: string,
    format: import('../../shared/types/ipc.types').AiArtifactFormat,
    stage?: StageName,
  ) => {
    wfLog('API', 'Sending workflow:aiEditArtifact', { projectId, stage, format, instructionLen: instruction.length });
    return getElectronApi().workflow.aiEditArtifact({ projectId, currentContent, instruction, format, stage });
  },

  onStream: (cb: (event: WorkflowStreamEvent) => void) =>
    getElectronApi().workflow.onStream((event) => {
      cb(event);
    }),
};
