// Glossary matching engine + semantic model IPC (design §2.10 / P2a-6 / P2b).
//
//   glossary:getSettings / setSettings / indexStatus / testMatch
//   glossary:modelDownload / modelCancel / modelInstallFromPackage /
//   modelInstallFromFolder / modelConfirmCustom / modelExportPackage /
//   modelVerify / modelRetry / modelRemove / modelClearNativeFailure
//   glossary:embeddingStart / embeddingPause
//   glossary:modelProgress / glossary:embeddingProgress   (M → R broadcasts)

import { BrowserWindow, dialog, ipcMain } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type { GlossaryService } from '../modules/glossary/glossary.service';
import type {
  GlossaryEmbeddingProgress,
  GlossaryModelInstallOutcome,
  GlossaryModelProgress,
  GlossaryModelStatus,
  GlossarySettings,
  GlossaryTestMatchPayload,
  GlossaryUsageReportPayload,
} from '../../shared/types/glossary.types';
import type { InstallResult } from '../modules/glossary/embedding/model-installer';

/** Broadcast a main → renderer event to every window. */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload);
    } catch {
      /* window may be closing */
    }
  }
}

/** Map installer internals onto the renderer-facing outcome type. */
function toOutcome(result: InstallResult | { status: 'cancelled' }): GlossaryModelInstallOutcome {
  if (result.status === 'cancelled') return { status: 'cancelled' };
  if (result.status === 'needs_confirm') {
    return {
      status: 'needs_confirm',
      modelId: result.modelId,
      files: result.files,
      reason: result.reason,
    };
  }
  return {
    status: 'installed',
    modelId: result.info.modelId,
    backend: result.backend,
    custom: result.info.custom,
  };
}

export function registerGlossaryHandlers(service: GlossaryService): void {
  // Forward model / embedding progress to the renderer (design §2.11.3).
  service.setProgressListeners({
    model: (progress: GlossaryModelProgress) =>
      broadcast(IPC_CHANNELS.GLOSSARY_MODEL_PROGRESS, progress),
    modelState: () => broadcast(IPC_CHANNELS.GLOSSARY_INDEX_STATUS, service.getModelStatus()),
    embedding: (progress: GlossaryEmbeddingProgress) =>
      broadcast(IPC_CHANNELS.GLOSSARY_EMBEDDING_PROGRESS, progress),
  });

  ipcMain.handle(IPC_CHANNELS.GLOSSARY_GET_SETTINGS, async () => {
    return service.getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_SET_SETTINGS,
    async (_event, payload: Partial<GlossarySettings>) => {
      log.info('[Glossary][IPC] glossary:setSettings', { keys: Object.keys(payload ?? {}) });
      return service.setSettings(payload ?? {});
    }
  );

  ipcMain.handle(IPC_CHANNELS.GLOSSARY_INDEX_STATUS, async () => {
    return service.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_TEST_MATCH,
    async (_event, payload: GlossaryTestMatchPayload) => {
      const text = payload?.text ?? '';
      log.info('[Glossary][IPC] glossary:testMatch', {
        chars: text.length,
        scenario: payload?.scenario,
        targetLang: payload?.targetLang,
      });
      return service.testMatch(payload);
    }
  );

  // Batch entry lookup for the 📚 glossary hit panel (P3).
  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_ENTRIES,
    async (_event, payload: { ids?: string[] }) => {
      const ids = Array.isArray(payload?.ids) ? payload.ids : [];
      return service.getEntries(ids);
    }
  );

  // Pre-export terminology usage report (P4-4).
  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_USAGE_REPORT,
    async (_event, payload: GlossaryUsageReportPayload) => {
      const text = payload?.text ?? '';
      const hits = payload?.hits ?? [];
      log.info('[Glossary][IPC] glossary:usageReport', { chars: text.length, hits: hits.length });
      return service.buildUsageReport(text, hits);
    }
  );

  // ── Model installation (P2b) ──────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_MODEL_DOWNLOAD,
    async (_event, payload?: { sourceIndex?: number }): Promise<GlossaryModelStatus> => {
      log.info('[Glossary][IPC] glossary:modelDownload', { sourceIndex: payload?.sourceIndex });
      return service.modelDownload(payload?.sourceIndex ?? 0);
    }
  );

  ipcMain.handle(IPC_CHANNELS.GLOSSARY_MODEL_CANCEL, async (): Promise<GlossaryModelStatus> => {
    service.cancelModelDownload();
    return service.getModelStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_MODEL_INSTALL_PACKAGE,
    async (): Promise<GlossaryModelInstallOutcome> => {
      const result = await dialog.showOpenDialog({
        title: 'Select an offline model package',
        filters: [{ name: 'Model package', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return { status: 'cancelled' };
      return toOutcome(await service.modelInstallPackage(result.filePaths[0]));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_MODEL_INSTALL_FOLDER,
    async (): Promise<GlossaryModelInstallOutcome> => {
      const result = await dialog.showOpenDialog({
        title: 'Select a model folder',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return { status: 'cancelled' };
      return toOutcome(await service.modelInstallFolder(result.filePaths[0]));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_MODEL_CONFIRM_CUSTOM,
    async (): Promise<GlossaryModelInstallOutcome> => {
      return toOutcome(await service.modelConfirmCustom());
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_MODEL_EXPORT_PACKAGE,
    async (): Promise<{ status: 'exported' | 'cancelled'; path?: string; files?: number }> => {
      const status = service.getModelStatus();
      const result = await dialog.showSaveDialog({
        title: 'Export the embedding model as an offline package',
        defaultPath: `stw-embedding-${status.modelId}-${status.revision ?? 'r1'}.zip`,
        filters: [{ name: 'Model package', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      const exported = service.modelExportPackage(result.filePath);
      return { status: 'exported', path: exported.path, files: exported.files };
    }
  );

  ipcMain.handle(IPC_CHANNELS.GLOSSARY_MODEL_VERIFY, async (): Promise<GlossaryModelStatus> => {
    return service.modelVerify();
  });

  ipcMain.handle(IPC_CHANNELS.GLOSSARY_MODEL_RETRY, async (): Promise<GlossaryModelStatus> => {
    return service.modelRetry();
  });

  ipcMain.handle(IPC_CHANNELS.GLOSSARY_MODEL_REMOVE, async (): Promise<GlossaryModelStatus> => {
    return service.modelRemove();
  });

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_MODEL_CLEAR_NATIVE,
    async (): Promise<GlossaryModelStatus> => {
      service.modelClearNativeFailure();
      return service.getModelStatus();
    }
  );

  // ── Background vector indexing (P2b) ──────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_EMBEDDING_START,
    async (): Promise<GlossaryEmbeddingProgress> => {
      return service.startEmbedding();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GLOSSARY_EMBEDDING_PAUSE,
    async (): Promise<GlossaryEmbeddingProgress> => {
      service.pauseEmbedding();
      return service.getEmbeddingProgress();
    }
  );
}
