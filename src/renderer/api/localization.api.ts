import type { LocalizeLanguage, DocumentDraft } from '../../shared/types/document.types';
import type {
  LocalizeProgressEvent,
  LocalizeStreamEvent,
  LocalizeStatusResult,
  LocalizeContinuePayload,
  LocalizeHumanLocalizeSubmitPayload,
  LocalizeHumanConfirmSubmitPayload,
  LocalizeGoBackPayload,
} from '../../shared/types/ipc.types';
import type { LocalizationStage, LocalizeRun, LocalizeRunState } from '../../shared/types/localization.types';

function getElectronApi() {
  if (!window.electronAPI) throw new Error('electronAPI is unavailable — running outside Electron?');
  return window.electronAPI;
}

export const localizationApi = {
  selectFiles: async (): Promise<string[]> => {
    const paths = await getElectronApi().localization.selectFiles();
    console.info('[Localize][API] selectFiles', { count: paths.length });
    return paths;
  },
  start: async (filePaths: string[], targetLanguage: LocalizeLanguage): Promise<void> => {
    console.info('[Localize][API] start', { fileCount: filePaths.length, targetLanguage });
    await getElectronApi().localization.start({ filePaths, targetLanguage });
  },
  getStatus: async (): Promise<LocalizeStatusResult> => {
    return getElectronApi().localization.getStatus();
  },
  exportTo: async (): Promise<{ destDir: string; count: number } | null> => {
    const result = await getElectronApi().localization.exportTo();
    console.info('[Localize][API] exportTo', result);
    return result;
  },
  continue: async (stage: LocalizationStage, editedDrafts?: DocumentDraft[]): Promise<void> => {
    const payload: LocalizeContinuePayload = { stage, editedDrafts };
    console.info('[Localize][API] continue', { stage, editedCount: editedDrafts?.length ?? 0 });
    await getElectronApi().localization.continue(payload);
  },
  submitHumanLocalizeReview: async (
    editedDrafts: DocumentDraft[],
    acceptedCommentIds: string[]
  ): Promise<void> => {
    const payload: LocalizeHumanLocalizeSubmitPayload = { editedDrafts, acceptedCommentIds };
    console.info('[Localize][API] submitHumanLocalizeReview', {
      draftCount: editedDrafts.length,
      acceptedCount: acceptedCommentIds.length,
    });
    await getElectronApi().localization.submitHumanLocalizeReview(payload);
  },
  submitHumanConfirm: async (
    editedDrafts: DocumentDraft[],
    acceptedCommentIds: string[]
  ): Promise<void> => {
    const payload: LocalizeHumanConfirmSubmitPayload = { editedDrafts, acceptedCommentIds };
    console.info('[Localize][API] submitHumanConfirm', {
      draftCount: editedDrafts.length,
      acceptedCount: acceptedCommentIds.length,
    });
    await getElectronApi().localization.submitHumanConfirm(payload);
  },
  goBack: async (stage: LocalizationStage): Promise<void> => {
    const payload: LocalizeGoBackPayload = { stage };
    console.info('[Localize][API] goBack', payload);
    await getElectronApi().localization.goBack(payload);
  },
  listRuns: async (): Promise<LocalizeRun[]> => {
    const runs = await getElectronApi().localization.listRuns();
    console.info('[Localize][API] listRuns', { count: runs.length });
    return runs;
  },
  getRun: async (runId: string): Promise<LocalizeRunState | null> => {
    return getElectronApi().localization.getRun(runId);
  },
  deleteRun: async (runId: string): Promise<void> => {
    console.info('[Localize][API] deleteRun', { runId });
    await getElectronApi().localization.deleteRun(runId);
  },
  loadRun: async (runId: string): Promise<LocalizeRunState | null> => {
    const run = await getElectronApi().localization.loadRun(runId);
    console.info('[Localize][API] loadRun', { runId, loaded: !!run });
    return run;
  },
  onProgress: (cb: (event: LocalizeProgressEvent) => void) =>
    getElectronApi().localization.onProgress(cb),
  onStream: (cb: (event: LocalizeStreamEvent) => void) =>
    getElectronApi().localization.onStream(cb),
};