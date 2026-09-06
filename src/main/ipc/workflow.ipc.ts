import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type { WorkflowEngine } from '../modules/workflow/index';
import type { ReviewComment } from '../../shared/types/document.types';
import { allowFileReadMany } from '../modules/security/path-guard';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';

export function registerWorkflowHandlers(engine: WorkflowEngine): void {
  ipcMain.handle(IPC_CHANNELS.WORKFLOW_START, async (_event, payload) => {
    log.info('[WF][IPC] workflow:start received', {
      projectId: payload.projectId,
      fileCount: payload.filePaths?.length ?? 0,
      filePaths: payload.filePaths,
    });
    // Register the input files so the renderer can preview them via file:read.
    allowFileReadMany(payload.filePaths ?? []);
    const projectId = payload.projectId ?? uuidv4();
    try {
      const state = await engine.startWorkflow(
        projectId,
        payload.filePaths ?? [],
        payload.documentOutline,
        payload.parseInstruction,
        payload.fileInstructions
      );
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
      draftCount: payload.editedDrafts?.length ?? 0,
      acceptedCount: payload.acceptedCommentIds?.length ?? 0,
    });

    const currentState = engine.getState(payload.projectId);
    // Store the edited drafts as humanEditedDrafts (multi-draft, M1) plus the
    // legacy single-string humanEdits (drafts[0].content) for backward compat.
    // We do NOT overwrite drafts here because going-back to human_review
    // must show the original draft, not a previously accepted version.
    engine.resumeFromHumanInput(payload.projectId, {
      humanEditedDrafts: payload.editedDrafts ?? [],
      humanEdits: payload.editedDrafts?.[0]?.content ?? '',
      aiReviewComments: (currentState?.aiReviewComments ?? []).map((c: ReviewComment) => ({
        ...c,
        accepted: payload.acceptedCommentIds.includes(c.id),
      })),
    });
    log.info('[WF][IPC] workflow:humanReviewSubmit applied — humanEditedDrafts stored', { projectId: payload.projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_HUMAN_CONFIRM_SUBMIT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:humanConfirmSubmit received', {
      projectId: payload.projectId,
      approved: payload.approved,
      targetLanguage: payload.targetLanguage,
      hasEditedDrafts: !!payload.editedDrafts,
      acceptedCount: payload.acceptedCommentIds?.length ?? 0,
    });
    const currentState = engine.getState(payload.projectId);
    engine.resumeFromHumanInput(payload.projectId, {
      humanConfirmed: payload.approved,
      targetLanguage: payload.targetLanguage ?? 'zh-CN',
      skipLocalization: payload.skipLocalization ?? true,
      // If the user edited drafts in Stage 6b, store as humanEditedDrafts so
      // the pipeline applies them to drafts for subsequent DITA stages.
      ...(payload.editedDrafts ? { humanEditedDrafts: payload.editedDrafts, humanEdits: payload.editedDrafts[0]?.content ?? '' } : {}),
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
    // M3: real pause — aborts the in-flight graph invoke (cancelling the
    // current LLM call via the threaded AbortSignal) and marks PAUSED:USER.
    log.info('[WF][IPC] workflow:pause received', { projectId });
    await engine.pauseWorkflow(projectId);
    log.info('[WF][IPC] workflow:pause applied', { projectId });
  });

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_RESUME, async (_event, { projectId }) => {
    log.info('[WF][IPC] workflow:resume received', { projectId });
    const state = engine.getState(projectId);
    if (state?.status === 'PAUSED:USER') {
      // Resume a user-paused workflow from its last checkpoint.
      await engine.resumeWorkflow(projectId);
    } else {
      // Resume a human-interrupt stage.
      engine.resumeFromHumanInput(projectId, {});
    }
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
    // Apply edits to the state channel that owns the artifact before resuming
    // so every confirmation step feeds the human-adjusted output downstream.
    const resumeData = {
      ...(payload.editedDrafts ? { drafts: payload.editedDrafts } : {}),
      ...(payload.editedInputFiles ? { inputFiles: payload.editedInputFiles } : {}),
      ...(payload.editedAnalysisResults ? { analysisResults: payload.editedAnalysisResults } : {}),
      ...(typeof payload.editedAnalysisSynthesisMarkdown === 'string'
        ? { analysisSynthesisMarkdown: payload.editedAnalysisSynthesisMarkdown }
        : {}),
      ...(payload.editedReferenceSearchResults ? { referenceSearchResults: payload.editedReferenceSearchResults } : {}),
      ...(payload.editedLocalizedDrafts ? { localizedDrafts: payload.editedLocalizedDrafts } : {}),
      ...(payload.editedDitaDocuments ? { ditaDocuments: payload.editedDitaDocuments } : {}),
    };
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

  ipcMain.handle(IPC_CHANNELS.WORKFLOW_AI_EDIT_ARTIFACT, async (_event, payload) => {
    log.info('[WF][IPC] workflow:aiEditArtifact received', {
      projectId: payload.projectId,
      stage: payload.stage,
      format: payload.format,
      instructionLen: payload.instruction?.length ?? 0,
      contentLen: payload.currentContent?.length ?? 0,
    });
    try {
      const edited = await engine.aiEditArtifact(
        payload.projectId,
        payload.currentContent ?? '',
        payload.instruction ?? '',
        payload.format ?? 'text',
        payload.stage,
      );
      log.info('[WF][IPC] workflow:aiEditArtifact completed', {
        projectId: payload.projectId,
        stage: payload.stage,
        resultLen: edited.length,
      });
      return edited;
    } catch (err) {
      log.error('[WF][IPC] workflow:aiEditArtifact failed', { projectId: payload.projectId, error: String(err) });
      throw err;
    }
  });
}
