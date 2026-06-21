import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type { WorkflowEngine } from '../modules/workflow/index';
import type { ReviewComment } from '../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';

export function registerWorkflowHandlers(engine: WorkflowEngine): void {
  ipcMain.handle(IPC_CHANNELS.WORKFLOW_START, async (_event, payload) => {
    log.info('[WF][IPC] workflow:start received', {
      projectId: payload.projectId,
      fileCount: payload.filePaths?.length ?? 0,
      filePaths: payload.filePaths,
    });
    const projectId = payload.projectId ?? uuidv4();
    try {
      const state = await engine.startWorkflow(projectId, payload.filePaths ?? []);
      log.info('[WF][IPC] workflow:start completed', {
        projectId: state.projectId,
        stage: state.currentStage,
        status: state.status,
      });
      return state;
    } catch (err) {
      log.error('[WF][IPC] workflow:start failed', { projectId, error: String(err) });
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_STATUS, async (_event, { projectId }) => {
    const state = engine.getState(projectId);
    log.info('[WF][IPC] workflow:status', {
      projectId,
      exists: !!state,
      stage: state?.currentStage,
      status: state?.status,
    });
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_HUMAN_REVIEW_SUBMIT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:humanReviewSubmit received', {
      projectId: payload.projectId,
      acceptedCount: payload.acceptedCommentIds?.length ?? 0,
    });

    const currentState = engine.getState(payload.projectId);
    // Store the edited content as humanEdits — the pipeline resume handler
    // will apply it to drafts[] for subsequent stages (forward flow only).
    // We do NOT overwrite drafts here because going-back to human_review
    // must show the original draft, not a previously accepted version.
    engine.resumeFromHumanInput(payload.projectId, {
      humanEdits: payload.editedContent,
      aiReviewComments: (currentState?.aiReviewComments ?? []).map((c: ReviewComment) => ({
        ...c,
        accepted: payload.acceptedCommentIds.includes(c.id),
      })),
    });
    log.info('[WF][IPC] workflow:humanReviewSubmit applied — humanEdits stored', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_HUMAN_CONFIRM_SUBMIT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:humanConfirmSubmit received', {
      projectId: payload.projectId,
      approved: payload.approved,
      targetLanguage: payload.targetLanguage,
      hasEditedContent: !!payload.editedContent,
      acceptedCount: payload.acceptedCommentIds?.length ?? 0,
    });
    const currentState = engine.getState(payload.projectId);
    engine.resumeFromHumanInput(payload.projectId, {
      humanConfirmed: payload.approved,
      targetLanguage: payload.targetLanguage ?? 'zh-CN',
      skipLocalization: payload.skipLocalization ?? false,
      // If the user edited the draft in Stage 6b, store as humanEdits so the
      // pipeline applies it to drafts[] for subsequent stages (localize, etc.).
      ...(payload.editedContent ? { humanEdits: payload.editedContent } : {}),
      // Mark accepted post-edit review comments so downstream stages know.
      postEditReviewComments: (currentState?.postEditReviewComments ?? []).map((c: ReviewComment) => ({
        ...c,
        accepted: payload.acceptedCommentIds?.includes(c.id) ?? false,
      })),
    });
    log.info('[WF][IPC] workflow:humanConfirmSubmit applied', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_HUMAN_LOCALIZE_SUBMIT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:humanLocalizeSubmit received', {
      projectId: payload.projectId,
      draftCount: payload.editedLocalizedDrafts?.length ?? 0,
      acceptedCount: payload.acceptedCommentIds?.length ?? 0,
    });
    engine.resumeFromHumanInput(payload.projectId, {
      localizedDrafts: payload.editedLocalizedDrafts,
      localizeReviewComments: (engine.getState(payload.projectId)?.localizeReviewComments ?? []).map((c: ReviewComment) => ({
        ...c,
        accepted: payload.acceptedCommentIds.includes(c.id),
      })),
    });
    log.info('[WF][IPC] workflow:humanLocalizeSubmit applied', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_HUMAN_DITA_SUBMIT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:humanDitaSubmit received', {
      projectId: payload.projectId,
      docCount: payload.editedDitaDocuments?.length ?? 0,
      acceptedCount: payload.acceptedCommentIds?.length ?? 0,
    });
    engine.resumeFromHumanInput(payload.projectId, {
      ditaDocuments: payload.editedDitaDocuments,
      ditaReviewComments: (engine.getState(payload.projectId)?.ditaReviewComments ?? []).map((c: ReviewComment) => ({
        ...c,
        accepted: payload.acceptedCommentIds.includes(c.id),
      })),
    });
    log.info('[WF][IPC] workflow:humanDitaSubmit applied', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_PAUSE, async (_event, { projectId }) => {
    // Pause is a no-op in current implementation — human review stages handle pausing
    void projectId;
    log.info('[WF][IPC] workflow:pause (no-op)', { projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_RESUME, async (_event, { projectId }) => {
    log.info('[WF][IPC] workflow:resume received', { projectId });
    engine.resumeFromHumanInput(projectId, {});
    log.info('[WF][IPC] workflow:resume applied', { projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_GO_BACK, async (_event, payload) => {
    log.info('[WF][IPC] workflow:goBack received', {
      projectId: payload.projectId,
      targetStage: payload.targetStage,
    });
    await engine.goBackToStage(payload.projectId, payload.targetStage);
    log.info('[WF][IPC] workflow:goBack applied', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_REVIEW_CONTINUE, async (_event, payload) => {
    log.info('[WF][IPC] workflow:reviewContinue received', {
      projectId: payload.projectId,
      stage: payload.stage,
      hasEditedDrafts: !!payload.editedDrafts,
    });
    // If edited drafts are provided (e.g. from review_draft AI editing),
    // apply them to state before resuming so downstream stages use the edits.
    const resumeData = payload.editedDrafts ? { drafts: payload.editedDrafts } : {};
    engine.resumeFromHumanInput(payload.projectId, resumeData);
    log.info('[WF][IPC] workflow:reviewContinue applied', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_AI_EDIT_DRAFT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:aiEditDraft received', {
      projectId: payload.projectId,
      instructionLen: payload.instruction?.length ?? 0,
      contentLen: payload.currentContent?.length ?? 0,
    });
    try {
      const edited = await engine.aiEditDraft(
        payload.projectId,
        payload.currentContent ?? '',
        payload.instruction ?? ''
      );
      log.info('[WF][IPC] workflow:aiEditDraft completed', {
        projectId: payload.projectId,
        resultLen: edited.length,
      });
      return edited;
    } catch (err) {
      log.error('[WF][IPC] workflow:aiEditDraft failed', { projectId: payload.projectId, error: String(err) });
      throw err;
    }
  });
}
