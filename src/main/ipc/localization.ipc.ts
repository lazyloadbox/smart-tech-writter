import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type {
  LocalizeStartPayload,
  LocalizeContinuePayload,
  LocalizeHumanLocalizeSubmitPayload,
  LocalizeHumanConfirmSubmitPayload,
  LocalizeGoBackPayload,
  LocalizeSplitExportPayload,
  LocalizeSplitPreviewPayload,
} from '../../shared/types/ipc.types';
import type { LocalizationService } from '../modules/localization/localization.service';
import { allowFileReadMany } from '../modules/security/path-guard';
import {
  buildSplitDirectoryName,
  buildSplitDitaMap,
  buildSplitPlan,
  composeSplitFiles,
  ditaToMarkdown,
  summarizeSplit,
  toSectionDocxName,
} from '../modules/document-builder';
import { buildDocx } from '../modules/document-builder/docx.builder';
import log from 'electron-log';
import { en as ui } from '../../shared/i18n';

/** Find a localized result by its export file name. */
function findLocalizedResult(service: LocalizationService, exportFileName: string) {
  return service.getResults().find((result) => result.exportFileName === exportFileName) ?? null;
}

/** Create `base` or `base (2)`, `base (3)` … avoiding overwrites. */
function createUniqueDirectory(base: string): string {
  let candidate = base;
  let counter = 2;
  while (fs.existsSync(candidate)) {
    candidate = `${base} (${counter})`;
    counter++;
  }
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

/** Write a file inside `destDir`, refusing path escapes. */
function writeInside(destDir: string, fileName: string, content: Buffer | string): void {
  const full = path.join(destDir, fileName);
  if (path.dirname(full) !== destDir) {
    throw new Error(`Refusing to write outside the export directory: ${fileName}`);
  }
  fs.writeFileSync(full, content, { flag: 'wx' });
}

/** `name.ext` → `name (2).ext` when the target already exists. */
function uniqueFilePath(destDir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(destDir, fileName);
  let counter = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${base} (${counter})${ext}`);
    counter++;
  }
  return candidate;
}

export function registerLocalizationHandlers(service: LocalizationService): void {
  ipcMain.handle(IPC_CHANNELS.LOCALIZE_SELECT_FILES, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: ui.backend.ditaXml, extensions: ['dita', 'xml'] },
        { name: ui.backend.allFiles, extensions: ['*'] },
      ],
      title: ui.backend.chooseDitaFiles,
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

  ipcMain.handle(IPC_CHANNELS.LOCALIZE_AI_EDIT_ARTIFACT, async (_event, payload) => {
    log.info('[Localize][IPC] localize:aiEditArtifact', {
      format: payload.format,
      instructionLen: payload.instruction?.length ?? 0,
      contentLen: payload.currentContent?.length ?? 0,
    });
    return service.aiEditArtifact(
      payload.currentContent ?? '',
      payload.instruction ?? '',
      payload.format ?? 'xml',
    );
  });

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
      title: ui.backend.chooseExportDirectory,
    });
    if (dirResult.canceled || dirResult.filePaths.length === 0) return null;
    const destDir = dirResult.filePaths[0];
    const count = await service.exportTo(destDir);
    log.info('[Localize][IPC] localize:export done', { destDir, count });
    return { destDir, count };
  });

  // ── Section split export for localized results (S3-3) ──────────────────────

  ipcMain.handle(
    IPC_CHANNELS.LOCALIZE_SPLIT_PREVIEW,
    async (_event, payload: LocalizeSplitPreviewPayload) => {
      const result = findLocalizedResult(service, payload.exportFileName);
      if (!result) return null;
      const plan = buildSplitPlan(result.content, result.fileName);
      return summarizeSplit(plan);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCALIZE_SPLIT_EXPORT,
    async (event, payload: LocalizeSplitExportPayload) => {
      const result = findLocalizedResult(service, payload.exportFileName);
      if (!result) return null;
      const plan = buildSplitPlan(result.content, result.fileName);
      const composed = composeSplitFiles(plan, payload.options);

      const win = BrowserWindow.fromWebContents(event.sender);
      const dirResult = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory', 'createDirectory'],
        title: ui.backend.chooseOutputDirectory,
      });
      if (dirResult.canceled || dirResult.filePaths.length === 0) return null;

      const baseDir = dirResult.filePaths[0];
      const fullFiles: { fileName: string; format: string }[] = [];
      if (payload.options.includeFull) {
        const target = uniqueFilePath(baseDir, result.exportFileName);
        fs.writeFileSync(target, result.content, { flag: 'wx' });
        fullFiles.push({
          fileName: path.basename(target),
          format: path.extname(target).replace(/^\./, '') || 'dita',
        });
      }
      if (composed.length === 0) {
        if (fullFiles.length === 0) return null;
        return { destDir: baseDir, files: [], fullFiles, warnings: plan.warnings };
      }

      const baseTitle = result.fileName.replace(/\.[^.]+$/, '');
      const destDir = createUniqueDirectory(
        path.join(baseDir, buildSplitDirectoryName(baseTitle))
      );
      const formats = new Set(payload.options.formats ?? ['dita']);
      const files: { fileName: string; format: 'dita' | 'docx'; valid: boolean; errors?: string[] }[] = [];
      const ditaNames: string[] = [];
      const now = new Date().toISOString();

      for (const file of composed) {
        if (formats.has('dita')) {
          const fileName = `${file.baseName}.dita`;
          writeInside(destDir, fileName, file.ditaContent);
          ditaNames.push(fileName);
          files.push({ fileName, format: 'dita', valid: file.valid, errors: file.errors });
        }
        if (formats.has('docx')) {
          const fileName = toSectionDocxName(file.baseName);
          const buffer = await buildDocx(
            {
              id: `${result.sourcePath}-${file.sectionIndex}`,
              title: result.fileName,
              content: ditaToMarkdown(file.ditaContent),
              createdAt: now,
              updatedAt: now,
            },
            { headerText: result.fileName }
          );
          writeInside(destDir, fileName, buffer);
          files.push({ fileName, format: 'docx', valid: true });
        }
      }

      if (payload.options.createMap && ditaNames.length > 0) {
        const mapName = `${baseTitle}.ditamap`;
        writeInside(destDir, mapName, buildSplitDitaMap(result.fileName, ditaNames));
        files.push({ fileName: mapName, format: 'dita', valid: true });
      }

      log.info('[Localize][IPC] localize:splitExport done', {
        destDir,
        files: files.length,
        full: fullFiles.length,
      });
      return { destDir, files, fullFiles, warnings: plan.warnings };
    }
  );
}
