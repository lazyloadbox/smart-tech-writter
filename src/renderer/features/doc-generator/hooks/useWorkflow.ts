import { useEffect, useCallback, useRef } from 'react';
import { useWorkflowStore } from '../../../stores/workflow.store';
import { workflowApi } from '../../../api/workflow.api';
import type { DocGenState, StageName, WorkflowLogEntry } from '../../../../shared/types/workflow.types';
import type { LocalizeLanguage } from '../../../../shared/types/document.types';

export function useWorkflow() {
  const store = useWorkflowStore();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const unsubscribeStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    console.info('[WF][Renderer][Hook] Subscribing to progress events', { projectId: store.projectId || '(none)' });
    unsubscribeRef.current = workflowApi.onProgress((event) => {
      if (event.projectId === store.projectId || !store.projectId) {
        console.info('[WF][Renderer][Hook] Applying progress event', {
          projectId: event.projectId,
          stage: event.stage,
          status: event.status,
          message: event.message,
          logEntryCount: event.logEntries?.length ?? 0,
        });

        // Apply log entries if present (do this before setState to ensure they stick)
        if (event.logEntries && event.logEntries.length > 0) {
          store.appendLogs(event.logEntries as WorkflowLogEntry[]);
        }

        // Track latest progress message for UI display (e.g. current file being processed)
        if (event.message) {
          store.setProgressMessage(event.message);
        }

        // Clear stream chunks when stage changes
        const prevStage = store.currentStage;
        const stageChanged = event.stage !== prevStage;
        store.setState({
          currentStage: event.stage as DocGenState['currentStage'],
          status: event.status as DocGenState['status'],
        });
        if (stageChanged) {
          store.clearStreamChunks();
          store.setProgressMessage('');
        }

        // Fetch full state on stage transitions only (not on every progress event)
        // to avoid race conditions that could overwrite accumulated logs.
        if (stageChanged && store.projectId) {
          workflowApi.getStatus(store.projectId).then((fullState: DocGenState | null) => {
            if (fullState) {
              // Merge: keep existing logs and stream chunks, update everything else
              const currentLogs = useWorkflowStore.getState().workflowLogs;
              store.setState({
                ...fullState,
                workflowLogs: currentLogs,
              });
            }
          });
        }
      } else {
        console.info('[WF][Renderer][Hook] Ignoring progress for other project', {
          incomingProjectId: event.projectId,
          currentProjectId: store.projectId,
        });
      }
    });

    // Subscribe to AI stream events
    unsubscribeStreamRef.current = workflowApi.onStream((event) => {
      if (event.projectId === store.projectId || !store.projectId) {
        store.appendStreamChunk(event.stage as StageName, event.chunk);
      }
    });

    return () => {
      console.info('[WF][Renderer][Hook] Unsubscribing from events');
      unsubscribeRef.current?.();
      unsubscribeStreamRef.current?.();
    };
  }, [store.projectId]);

  const startWorkflow = useCallback(async (filePaths: string[]) => {
    console.info('[WF][Renderer][Hook] startWorkflow called', { fileCount: filePaths.length });
    store.clearStreamChunks();
    const initialState = await workflowApi.start(filePaths);
    store.setState({ ...initialState, workflowLogs: [] });
    store.clearStreamChunks();
    console.info('[WF][Renderer][Hook] Initial workflow state applied', {
      projectId: initialState.projectId,
      stage: initialState.currentStage,
      status: initialState.status,
    });
  }, []);

  const goBack = useCallback(
    (targetStage: StageName) => {
      console.info('[WF][Renderer][Hook] goBack called', { projectId: store.projectId, targetStage });
      store.clearStreamChunks();
      return workflowApi.goBack(store.projectId, targetStage);
    },
    [store.projectId]
  );

  const submitHumanReview = useCallback(
    (editedContent: string, acceptedIds: string[]) =>
      workflowApi.submitHumanReview(store.projectId, editedContent, acceptedIds),
    [store.projectId]
  );

  const submitHumanConfirm = useCallback(
    (approved: boolean, targetLanguage?: LocalizeLanguage, editedContent?: string, acceptedCommentIds?: string[], skipLocalization?: boolean) =>
      workflowApi.submitHumanConfirm(store.projectId, approved, targetLanguage, editedContent, acceptedCommentIds, skipLocalization),
    [store.projectId]
  );

  const submitHumanLocalize = useCallback(
    (drafts: DocGenState['localizedDrafts'], acceptedIds: string[]) =>
      workflowApi.submitHumanLocalize(store.projectId, drafts, acceptedIds),
    [store.projectId]
  );

  const submitHumanDita = useCallback(
    (ditaDocs: DocGenState['ditaDocuments'], acceptedIds: string[]) =>
      workflowApi.submitHumanDita(store.projectId, ditaDocs, acceptedIds),
    [store.projectId]
  );

  const reviewContinue = useCallback(
    (stage: StageName, editedDrafts?: import('../../../../shared/types/document.types').DocumentDraft[]) => {
      console.info('[WF][Renderer][Hook] reviewContinue called', { projectId: store.projectId, stage, hasEditedDrafts: !!editedDrafts });
      return workflowApi.reviewContinue(store.projectId, stage, editedDrafts);
    },
    [store.projectId]
  );

  const aiEditDraft = useCallback(
    (currentContent: string, instruction: string) =>
      workflowApi.aiEditDraft(store.projectId, currentContent, instruction),
    [store.projectId]
  );

  const setTargetLanguage = useCallback(
    (lang: LocalizeLanguage) => store.setTargetLanguage(lang),
    []
  );

  return {
    state: store,
    startWorkflow,
    goBack,
    submitHumanReview,
    submitHumanConfirm,
    submitHumanLocalize,
    submitHumanDita,
    reviewContinue,
    aiEditDraft,
    setTargetLanguage,
  };
}
