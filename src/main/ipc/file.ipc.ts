import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver') as (format: string, opts?: object) => import('archiver').Archiver;
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type { WorkflowEngine } from '../modules/workflow/index';
import { allowFileReadMany, assertFileReadAllowed } from '../modules/security/path-guard';
import log from 'electron-log';

export function registerFileHandlers(engine: WorkflowEngine): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SELECT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Files', extensions: ['docx', 'pdf', 'txt', 'md', 'markdown', 'csv', 'log', 'eml', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sh', 'bash', 'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    // Only files the user explicitly picked via the dialog may be read back.
    allowFileReadMany(result.filePaths);
    return result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, { filePath }) => {
    // Path-scope validation: only user-approved files or files under trusted
    // app-owned directories (projects output, RAG search dir) are readable.
    assertFileReadAllowed(filePath);
    return fs.readFileSync(filePath, 'utf-8');
  });

  ipcMain.handle('file:showInFolder', async (_event, { filePath }) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('file:downloadZip', async (event, { projectId }) => {
    const state = engine.getState(projectId);
    if (!state || state.outputDocuments.length === 0) return;

    const win = BrowserWindow.fromWebContents(event.sender);
    const saveResult = await dialog.showSaveDialog(win!, {
      defaultPath: `project-${projectId.slice(0, 8)}-documents.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    if (saveResult.canceled || !saveResult.filePath) return;

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(saveResult.filePath!);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      for (const doc of state.outputDocuments) {
        if (fs.existsSync(doc.filePath)) {
          archive.file(doc.filePath, { name: doc.fileName });
        }
      }
      archive.finalize();
    });
  });

  // Save an individual output document (DITA or DOCX) to a user-chosen location
  ipcMain.handle(IPC_CHANNELS.FILE_SAVE_DITA, async (event, { filePath, fileName, format }) => {
    log.info('[File][IPC] file:saveDita', { filePath, fileName, format });
    if (!fs.existsSync(filePath)) {
      log.warn('[File][IPC] file:saveDita - source file not found', { filePath });
      return null;
    }

    const isDocx = format === 'docx' || fileName.toLowerCase().endsWith('.docx');
    const win = BrowserWindow.fromWebContents(event.sender);
    const saveResult = await dialog.showSaveDialog(win!, {
      defaultPath: fileName,
      filters: isDocx
        ? [
            { name: 'Word 文档', extensions: ['docx'] },
            { name: 'All Files', extensions: ['*'] },
          ]
        : [
            { name: 'DITA XML', extensions: ['dita', 'xml'] },
            { name: 'All Files', extensions: ['*'] },
          ],
    });
    if (saveResult.canceled || !saveResult.filePath) return null;

    fs.copyFileSync(filePath, saveResult.filePath);
    log.info('[File][IPC] file:saveDita - saved to', { destPath: saveResult.filePath });
    return saveResult.filePath;
  });

  // Export all output documents to user-chosen directory
  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_ALL, async (event, { projectId }) => {
    log.info('[File][IPC] file:exportAll', { projectId });
    const state = engine.getState(projectId);
    if (!state || state.outputDocuments.length === 0) {
      log.warn('[File][IPC] file:exportAll - no documents to export');
      return null;
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    const dirResult = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择导出目录',
    });
    if (dirResult.canceled || dirResult.filePaths.length === 0) return null;

    const destDir = dirResult.filePaths[0];
    let exportedCount = 0;
    for (const doc of state.outputDocuments) {
      if (fs.existsSync(doc.filePath)) {
        const destPath = path.join(destDir, doc.fileName);
        fs.copyFileSync(doc.filePath, destPath);
        exportedCount++;
      }
    }
    log.info('[File][IPC] file:exportAll - done', { projectId, destDir, exportedCount });
    return destDir;
  });
}
