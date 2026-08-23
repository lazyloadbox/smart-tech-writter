import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type {
  LocalizeStartPayload,
  LocalizeContinuePayload,
  LocalizeHumanLocalizeSubmitPayload,
  LocalizeHumanConfirmSubmitPayload,
  LocalizeGoBackPayload,
} from '../../shared/types/ipc.types';
import type { LocalizationService } from '../modules/localization/localization.service';
import { allowFileReadMany } from '../modules/security/path-guard';
import log from 'electron-log';

export function registerLocalizationHandlers(service: LocalizationService): void {
  ipcMain.handle(IPC_CHANNELS.LOCALIZE_SELECT_FILES, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'DITA XML', extensions: ['dita', 'xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      title: '选择要翻译的 DITA 文件',
    });
    allowFileReadMany(result.filePaths);
    return result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_START, async (_event, payload: LocalizeStartPayload) => {
    log.info('[Localize][IPC] localize:start', {
      fileCount: payload.filePaths?.length ?? 0,
      targetLanguage: payload.targetLanguage,
    });
    // Fire-and-forget: translation runs in the background, progress/stream
    // events are broadcast to all windows.
    void service.startTranslation(payload.filePaths, payload.targetLanguage, {
      onProgress: (event) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send(IPC_CHANNELS.LOCALIZE_PROGRESS, event);
        }
      },
      onStream: (event) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send(IPC_CHANNELS.LOCALIZE_STREAM, event);
        }
      },
    });
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_CONTINUE, async (_event, payload: LocalizeContinuePayload) => {
    log.info('[Localize][IPC] localize:continue', {
      stage: payload.stage,
      editedCount: payload.editedDrafts?.length ?? 0,
    });
    void service.continueFromReviewLocalize(payload.editedDrafts ?? [], {
      onProgress: (event) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send(IPC_CHANNELS.LOCALIZE_PROGRESS, event);
        }
      },
      onStream: (event) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send(IPC_CHANNELS.LOCALIZE_STREAM, event);
        }
      },
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.LOCALIZE_HUMAN_LOCALIZE_SUBMIT,
    async (_event, payload: LocalizeHumanLocalizeSubmitPayload) => {
      log.info('[Localize][IPC] localize:humanLocalizeSubmit', {
        draftCount: payload.editedDrafts?.length ?? 0,
        acceptedCount: payload.acceptedCommentIds?.length ?? 0,
      });
      void service.submitHumanLocalizeReview(payload.editedDrafts, payload.acceptedCommentIds, {
        onProgress: (event) => {
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send(IPC_CHANNELS.LOCALIZE_PROGRESS, event);
          }
        },
        onStream: (event) => {
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send(IPC_CHANNELS.LOCALIZE_STREAM, event);
          }
        },
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCALIZE_HUMAN_CONFIRM_SUBMIT,
    async (_event, payload: LocalizeHumanConfirmSubmitPayload) => {
      log.info('[Localize][IPC] localize:humanConfirmSubmit', {
        draftCount: payload.editedDrafts?.length ?? 0,
        acceptedCount: payload.acceptedCommentIds?.length ?? 0,
      });
      await service.submitHumanConfirm(payload.editedDrafts, payload.acceptedCommentIds);
    }
  );

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_GO_BACK, async (_event, payload: LocalizeGoBackPayload) => {
    log.info('[Localize][IPC] localize:goBack', { stage: payload.stage });
    await service.goBackToStage(payload.stage);
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_STATUS, async () => {
    return {
      status: service.getStatus(),
      stage: service.getStage(),
      results: service.getResults(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_RUNS_LIST, async () => {
    return service.listRuns();
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_RUNS_GET, async (_event, { runId }) => {
    return service.getRun(runId);
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_RUNS_DELETE, async (_event, { runId }) => {
    service.deleteRun(runId);
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_RUNS_LOAD, async (_event, { runId }) => {
    return service.loadRun(runId);
  });

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_EXPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dirResult = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择导出目录',
    });
    if (dirResult.canceled || dirResult.filePaths.length === 0) return null;
    const destDir = dirResult.filePaths[0];
    const count = await service.exportTo(destDir);
    log.info('[Localize][IPC] localize:export done', { destDir, count });
    return { destDir, count };
  });
}