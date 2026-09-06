import { useEffect } from 'react';
import { useLocalizationStore } from '../../../stores/localization.store';
import { localizationApi } from '../../../api/localization.api';
import type { LocalizeLanguage, DocumentDraft, ReviewComment } from '../../../../shared/types/document.types';
import type { LocalizationStage } from '../../../../shared/types/localization.types';
import { en as ui } from '../../../../shared/i18n';

/** Convert per-file results into DocumentDraft[] for the ReviewPanel. */
function toDrafts(results: ReturnType<typeof useLocalizationStore.getState>['results']): DocumentDraft[] {
  return results
    .filter((r) => r.status === 'done')
    .map((r) => ({
      id: r.sourcePath,
      title: r.fileName,
      content: r.content,
      createdAt: '',
      updatedAt: '',
    }));
}

/** Convert per-file results into original-content DocumentDraft[] (side-by-side review). */
function toOriginalDrafts(results: ReturnType<typeof useLocalizationStore.getState>['results']): DocumentDraft[] {
  return results
    .filter((r) => r.status === 'done')
    .map((r) => ({
      id: r.sourcePath,
      title: r.fileName,
      content: r.originalContent,
      createdAt: '',
      updatedAt: '',
    }));
}

/** Flatten per-file comments into a single ReviewComment[] for the ReviewPanel. */
function toComments(
  results: ReturnType<typeof useLocalizationStore.getState>['results'],
  key: 'reviewComments' | 'postEditComments'
): ReviewComment[] {
  return results.flatMap((r) => r[key] ?? []);
}

export function useLocalization() {
  const store = useLocalizationStore();

  const refreshStatus = async () => {
    const result = await localizationApi.getStatus();
    useLocalizationStore.getState().setStatus(result.status);
    useLocalizationStore.getState().setStage(result.stage);
    useLocalizationStore.getState().setResults(result.results);
  };

  useEffect(() => {
    const offProgress = localizationApi.onProgress((event) => {
      const { appendLog, setCurrentFile } = useLocalizationStore.getState();
      const stageLabel = STAGE_LABELS[event.stage] ?? event.stage;
      if (event.status === 'started') {
        setCurrentFile(event.fileName);
        appendLog({
          fileName: event.fileName,
          level: 'info',
          message: `${stageLabel}: ${event.fileName} (${event.index + 1}/${event.total})`,
        });
      } else if (event.status === 'done') {
        appendLog({ fileName: event.fileName, level: 'info', message: `${stageLabel} complete: ${event.fileName}` });
      } else {
        appendLog({
          fileName: event.fileName,
          level: 'error',
          message: `${stageLabel} failed: ${event.fileName} — ${event.message ?? ''}`,
        });
      }
      // Refresh status/results when a stage finishes (last file of the batch),
      // regardless of whether the last file succeeded or failed — the service
      // has already moved to the next pause/terminal state by then.
      if (event.index === event.total - 1 && (event.status === 'done' || event.status === 'failed')) {
        void refreshStatus();
      }
    });
    const offStream = localizationApi.onStream((event) => {
      useLocalizationStore.getState().appendStreamChunk({
        fileName: event.fileName,
        type: event.chunk.type,
        text: event.chunk.text,
        timestamp: Date.now(),
      });
    });
    return () => {
      offProgress();
      offStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectFiles = async () => {
    const paths = await localizationApi.selectFiles();
    if (paths.length > 0) {
      useLocalizationStore.getState().setFiles(paths);
      useLocalizationStore.getState().setStatus('idle');
      useLocalizationStore.getState().setStage('localize');
      useLocalizationStore.getState().setResults([]);
      useLocalizationStore.getState().setExportResult(null);
    }
  };

  const start = async () => {
    const { files, targetLanguage } = useLocalizationStore.getState();
    if (files.length === 0) return;
    useLocalizationStore.getState().setStatus('running');
    useLocalizationStore.getState().setStage('localize');
    useLocalizationStore.getState().setResults([]);
    useLocalizationStore.getState().setExportResult(null);
    useLocalizationStore.getState().setCurrentFile(null);
    // Clear previous run's stream/logs.
    useLocalizationStore.setState({ streamChunks: [], logs: [] });
    await localizationApi.start(files, targetLanguage);
  };

  const continueFromReviewLocalize = async (editedDrafts?: DocumentDraft[]) => {
    useLocalizationStore.getState().setStatus('running');
    useLocalizationStore.getState().setStage('localize_ai_review');
    useLocalizationStore.getState().setCurrentFile(null);
    useLocalizationStore.setState({ streamChunks: [], logs: [] });
    await localizationApi.continue('localize_ai_review', editedDrafts);
  };

  const submitHumanLocalizeReview = async (editedDrafts: DocumentDraft[], acceptedIds: string[]) => {
    useLocalizationStore.getState().setStatus('running');
    useLocalizationStore.getState().setStage('post_edit_review');
    useLocalizationStore.getState().setCurrentFile(null);
    useLocalizationStore.setState({ streamChunks: [], logs: [] });
    await localizationApi.submitHumanLocalizeReview(editedDrafts, acceptedIds);
  };

  const submitHumanConfirm = async (editedDrafts: DocumentDraft[], acceptedIds: string[]) => {
    await localizationApi.submitHumanConfirm(editedDrafts, acceptedIds);
    await refreshStatus();
  };

  const aiEditArtifact = async (currentContent: string, instruction: string) =>
    localizationApi.aiEditArtifact(currentContent, instruction, 'xml');

  const goBack = async (stage: LocalizationStage) => {
    await localizationApi.goBack(stage);
    await refreshStatus();
    useLocalizationStore.setState({ streamChunks: [], logs: [] });
  };

  const exportTo = async () => {
    const result = await localizationApi.exportTo();
    if (result) {
      useLocalizationStore.getState().setExportResult(result);
    }
  };

  const setTargetLanguage = (lang: LocalizeLanguage) => {
    useLocalizationStore.getState().setTargetLanguage(lang);
  };

  const reset = () => {
    useLocalizationStore.getState().reset();
  };

  // Derived data for the review stages.
  const localizedDrafts = toDrafts(store.results);
  const originalDrafts = toOriginalDrafts(store.results);
  const reviewComments = toComments(store.results, 'reviewComments');
  const postEditComments = toComments(store.results, 'postEditComments');

  return {
    ...store,
    localizedDrafts,
    originalDrafts,
    reviewComments,
    postEditComments,
    selectFiles,
    start,
    continueFromReviewLocalize,
    submitHumanLocalizeReview,
    submitHumanConfirm,
    aiEditArtifact,
    goBack,
    exportTo,
    setTargetLanguage,
    reset,
    refreshStatus,
  };
}

export const STAGE_LABELS: Record<LocalizationStage, string> = {
  ...ui.localization.stageSteps,
};
