import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type {
  DownloadZipResult,
  ExportBundlePayload,
  ExportBundleResult,
  SplitExportFileResult,
  SplitExportFullFile,
  SplitExportOptions,
  SplitExportPayload,
  SplitPreviewPayload,
} from '../../shared/types/ipc.types';
import type { DocGenState } from '../../shared/types/workflow.types';
import type { WorkflowEngine } from '../modules/workflow/index';
import { allowFileReadMany, assertFileReadAllowed } from '../modules/security/path-guard';
import {
  buildSplitDirectoryName,
  buildSplitDitaMap,
  buildSplitPlan,
  composeSplitFiles,
  ditaToMarkdown,
  summarizeSplit,
  toSafeFileName,
  toSectionDocxName,
} from '../modules/document-builder';
import { buildDocx } from '../modules/document-builder/docx.builder';
// Shared, dependency-free ZIP writer (no native/ESM loader pitfalls).
import { createZip } from '../modules/glossary/embedding/zip';
import log from 'electron-log';
import { en as ui } from '../../shared/i18n';

/** Resolve the DITA document a split-export request refers to. */
function resolveSplitDocument(
  engine: WorkflowEngine,
  projectId: string,
  documentId: string
): { id: string; title: string; content: string } | null {
  const state = engine.getState(projectId);
  if (!state) return null;
  const docs = state.ditaDocuments ?? [];
  const byId = docs.find((doc) => doc.id === documentId);
  if (byId) return byId;
  // The output document may predate the `documentId` field; fall back to the
  // single DITA document when there is exactly one candidate.
  if (docs.length === 1) return docs[0];
  return null;
}

/** Create `base` or `base (2)`, `base (3)` … so a previous export is never overwritten. */
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

/** Write a file inside `destDir`, refusing anything that would escape it. */
function writeInside(destDir: string, fileName: string, content: Buffer | string): string {
  const full = path.join(destDir, fileName);
  if (path.dirname(full) !== destDir) {
    throw new Error(`Refusing to write outside the export directory: ${fileName}`);
  }
  fs.writeFileSync(full, content, { flag: 'wx' });
  return full;
}

/**
 * Rebuild a `.docx` output from its sibling `.dita`. DOCX files written by
 * earlier versions are corrupt for Word (undefined numbering ids), and they
 * stay on disk inside old projects, so every export path refreshes them first.
 */
async function refreshDocxFile(docxPath: string, title?: string): Promise<void> {
  const ditaPath = docxPath.replace(/\.docx$/i, '.dita');
  if (ditaPath === docxPath || !fs.existsSync(docxPath) || !fs.existsSync(ditaPath)) return;
  try {
    const now = new Date().toISOString();
    const buffer = await buildDocx({
      id: path.basename(docxPath),
      title: title ?? path.basename(docxPath, path.extname(docxPath)),
      content: ditaToMarkdown(fs.readFileSync(ditaPath, 'utf-8')),
      createdAt: now,
      updatedAt: now,
    });
    fs.writeFileSync(docxPath, buffer);
  } catch (error) {
    log.warn('[File][IPC] refreshDocxFile failed; keeping existing file', { docxPath, error });
  }
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

/** `name.ext` → `name (2).ext` once that name is already used inside the archive. */
function uniqueZipEntryName(fileName: string, used: Set<string>): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = fileName;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter})${ext}`;
    counter++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Same idea for folder names, which have no extension to preserve. */
function uniqueEntryBase(base: string, used: Set<string>): string {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter})`;
    counter++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * The DITA sources that can be split for a project. Newer projects keep the
 * XML in `ditaDocuments`; older ones only have the exported `.dita` files, so
 * read them back from disk instead of silently skipping the section files.
 */
function collectDitaSources(state: DocGenState): { id: string; title: string; content: string }[] {
  const documented = (state.ditaDocuments ?? []).filter((doc) => doc.content?.trim());
  if (documented.length > 0) {
    return documented.map((doc) => ({ id: doc.id, title: doc.title, content: doc.content }));
  }
  return (state.outputDocuments ?? [])
    .filter((doc) => doc.format === 'dita' && doc.filePath && fs.existsSync(doc.filePath))
    .map((doc) => ({
      id: doc.documentId ?? doc.id,
      title: doc.title,
      content: fs.readFileSync(doc.filePath, 'utf-8'),
    }));
}

/**
 * Per-section `.dita` files (+ a `.ditamap`) for the ZIP download, one
 * `<Title>_sections/` folder per document — the archive mirrors what the
 * folder export produces.
 */
function collectSplitZipEntries(
  state: DocGenState,
  used: Set<string>
): { entries: { name: string; data: Buffer }[]; sectionFiles: number; folders: string[] } {
  const entries: { name: string; data: Buffer }[] = [];
  const folders: string[] = [];
  let sectionFiles = 0;

  for (const source of collectDitaSources(state)) {
    const plan = buildSplitPlan(source.content, source.title);
    const selected = plan.split.sections.map((section) => section.index);
    if (selected.length === 0) continue;
    const composed = composeSplitFiles(plan, {
      selected,
      formats: ['dita'],
      includeIntro: 'none',
      createMap: false,
      titleFromSection: false,
    });
    if (composed.length === 0) continue;

    const folder = `${uniqueEntryBase(buildSplitDirectoryName(source.title), used)}/`;
    folders.push(folder.slice(0, -1));
    const ditaNames: string[] = [];
    for (const file of composed) {
      const fileName = `${file.baseName}.dita`;
      ditaNames.push(fileName);
      entries.push({ name: `${folder}${fileName}`, data: Buffer.from(file.ditaContent, 'utf-8') });
      sectionFiles++;
    }
    const mapName = `${toSafeFileName(source.title)}.ditamap`;
    entries.push({
      name: `${folder}${mapName}`,
      data: Buffer.from(buildSplitDitaMap(source.title, ditaNames), 'utf-8'),
    });
  }

  return { entries, sectionFiles, folders };
}

/**
 * Copy the complete (unsplit) output files of one DITA document into `destDir`.
 * Used by the combined export so the user gets the whole document *and* the
 * per-section files from a single folder dialog.
 */
async function copyFullDocuments(
  state: DocGenState | null | undefined,
  documentId: string,
  destDir: string
): Promise<SplitExportFullFile[]> {
  const docs = state?.outputDocuments ?? [];
  let candidates = docs.filter((doc) => doc.documentId === documentId);
  if (candidates.length === 0) {
    const distinct = new Set(docs.map((doc) => doc.documentId ?? doc.id));
    // Older projects predate `documentId`; when there is only one document
    // every output belongs to it.
    candidates = distinct.size <= 1 ? docs : docs.filter((doc) => !doc.documentId);
  }
  const copied: SplitExportFullFile[] = [];
  for (const doc of candidates) {
    if (!doc.filePath || !fs.existsSync(doc.filePath)) continue;
    if (doc.format === 'docx') await refreshDocxFile(doc.filePath, doc.title);
    const target = uniqueFilePath(destDir, doc.fileName);
    fs.copyFileSync(doc.filePath, target);
    copied.push({ fileName: path.basename(target), format: doc.format });
  }
  return copied;
}

/** Compose and write the section files into a fresh `<title>_sections` folder. */
async function writeSplitFiles(
  doc: { id: string; title: string; content: string },
  options: SplitExportOptions,
  baseDir: string
): Promise<{ destDir: string; files: SplitExportFileResult[]; warnings: string[] } | null> {
  const plan = buildSplitPlan(doc.content, doc.title);
  const composed = composeSplitFiles(plan, options);
  if (composed.length === 0) return null;

  const destDir = createUniqueDirectory(
    path.join(baseDir, buildSplitDirectoryName(doc.title))
  );
  const formats = new Set(options.formats ?? ['dita']);
  const files: SplitExportFileResult[] = [];
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
          id: `${doc.id}-${file.sectionIndex}`,
          title: doc.title,
          content: ditaToMarkdown(file.ditaContent),
          createdAt: now,
          updatedAt: now,
        },
        { headerText: doc.title }
      );
      writeInside(destDir, fileName, buffer);
      files.push({ fileName, format: 'docx', valid: true });
    }
  }

  if (options.createMap && ditaNames.length > 0) {
    const mapName = `${toSafeFileName(doc.title)}.ditamap`;
    writeInside(destDir, mapName, buildSplitDitaMap(doc.title, ditaNames));
    files.push({ fileName: mapName, format: 'dita', valid: true });
  }

  return { destDir, files, warnings: plan.warnings };
}

export function registerFileHandlers(engine: WorkflowEngine): void {
  ipcMain.handle(IPC_CHANNELS.FILE_SELECT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: ui.backend.supportedFiles, extensions: ['docx', 'pdf', 'txt', 'md', 'markdown', 'csv', 'log', 'eml', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sh', 'bash', 'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg'] },
        { name: ui.backend.allFiles, extensions: ['*'] },
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
    if (/\.docx$/i.test(filePath)) await refreshDocxFile(filePath);
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('file:downloadZip', async (event, { projectId }): Promise<DownloadZipResult | null> => {
    const state = engine.getState(projectId);
    if (!state || state.outputDocuments.length === 0) return null;

    const win = BrowserWindow.fromWebContents(event.sender);
    const saveResult = await dialog.showSaveDialog(win!, {
      defaultPath: `project-${projectId.slice(0, 8)}-documents.zip`,
      filters: [{ name: ui.backend.zipArchive, extensions: ['zip'] }],
    });
    if (saveResult.canceled || !saveResult.filePath) return null;

    const used = new Set<string>();
    const entries: { name: string; data: Buffer }[] = [];
    for (const doc of state.outputDocuments) {
      if (!doc.filePath || !fs.existsSync(doc.filePath)) continue;
      if (doc.format === 'docx') await refreshDocxFile(doc.filePath, doc.title);
      entries.push({
        name: uniqueZipEntryName(doc.fileName, used),
        data: fs.readFileSync(doc.filePath),
      });
    }
    if (entries.length === 0) {
      log.warn('[File][IPC] file:downloadZip - no readable output files', { projectId });
      return null;
    }

    // Sections used to be missing from the download: add one `<Title>_sections/`
    // folder per document so the archive matches the folder export.
    const split = collectSplitZipEntries(state, used);
    entries.push(...split.entries);

    try {
      fs.writeFileSync(saveResult.filePath, createZip(entries));
    } catch (error) {
      // Never leave a 0-byte archive behind when the write fails.
      fs.rmSync(saveResult.filePath, { force: true });
      log.error('[File][IPC] file:downloadZip - failed', { projectId, destPath: saveResult.filePath, error });
      throw error;
    }

    log.info('[File][IPC] file:downloadZip - done', {
      destPath: saveResult.filePath,
      entries: entries.length,
      sectionFiles: split.sectionFiles,
      sectionFolders: split.folders,
    });
    return {
      filePath: saveResult.filePath,
      entries: entries.length,
      sectionFiles: split.sectionFiles,
      sectionFolders: split.folders,
    };
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
            { name: ui.backend.wordDocument, extensions: ['docx'] },
            { name: ui.backend.allFiles, extensions: ['*'] },
          ]
        : [
            { name: ui.backend.ditaXml, extensions: ['dita', 'xml'] },
            { name: ui.backend.allFiles, extensions: ['*'] },
          ],
    });
    if (saveResult.canceled || !saveResult.filePath) return null;

    if (isDocx) await refreshDocxFile(filePath);
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
      title: ui.backend.chooseOutputDirectory,
    });
    if (dirResult.canceled || dirResult.filePaths.length === 0) return null;

    const destDir = dirResult.filePaths[0];
    let exportedCount = 0;
    for (const doc of state.outputDocuments) {
      if (fs.existsSync(doc.filePath)) {
        if (doc.format === 'docx') await refreshDocxFile(doc.filePath, doc.title);
        const destPath = path.join(destDir, doc.fileName);
        fs.copyFileSync(doc.filePath, destPath);
        exportedCount++;
      }
    }

    // Also write the per-section files (one `<Title>_sections/` folder each) so
    // "export all to folder" and the ZIP download contain the same content.
    let sectionFiles = 0;
    for (const source of collectDitaSources(state)) {
      const plan = buildSplitPlan(source.content, source.title);
      const selected = plan.split.sections.map((section) => section.index);
      if (selected.length === 0) continue;
      const written = await writeSplitFiles(
        source,
        {
          selected,
          formats: ['dita'],
          includeIntro: 'none',
          createMap: false,
          titleFromSection: false,
        },
        destDir
      );
      sectionFiles += written?.files.length ?? 0;
    }

    log.info('[File][IPC] file:exportAll - done', { projectId, destDir, exportedCount, sectionFiles });
    return destDir;
  });

  // ── Section split export (S2 / S3, design §3.6) ──────────────────────────

  ipcMain.handle(IPC_CHANNELS.FILE_SPLIT_PREVIEW, async (_event, payload: SplitPreviewPayload) => {
    log.info('[File][IPC] file:splitPreview', payload);
    const doc = resolveSplitDocument(engine, payload.projectId, payload.documentId);
    if (!doc) {
      log.warn('[File][IPC] file:splitPreview - document not found', payload);
      return null;
    }
    const plan = buildSplitPlan(doc.content, doc.title);
    return summarizeSplit(plan);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_SPLIT_EXPORT, async (event, payload: SplitExportPayload) => {
    log.info('[File][IPC] file:splitExport', {
      projectId: payload.projectId,
      documentId: payload.documentId,
      options: payload.options,
    });
    const doc = resolveSplitDocument(engine, payload.projectId, payload.documentId);
    if (!doc) {
      log.warn('[File][IPC] file:splitExport - document not found', payload);
      return null;
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    const dirResult = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: ui.backend.chooseOutputDirectory,
    });
    if (dirResult.canceled || dirResult.filePaths.length === 0) return null;

    const baseDir = dirResult.filePaths[0];
    const state = engine.getState(payload.projectId);
    const fullFiles = payload.options.includeFull
      ? await copyFullDocuments(state, doc.id, baseDir)
      : [];
    const written = await writeSplitFiles(doc, payload.options, baseDir);

    if (!written) {
      if (fullFiles.length === 0) {
        log.warn('[File][IPC] file:splitExport - no sections selected');
        return null;
      }
      log.info('[File][IPC] file:splitExport - complete files only', { baseDir, full: fullFiles.length });
      return {
        destDir: baseDir,
        files: [],
        fullFiles,
        warnings: buildSplitPlan(doc.content, doc.title).warnings,
      };
    }

    log.info('[File][IPC] file:splitExport - done', {
      destDir: written.destDir,
      files: written.files.length,
      full: fullFiles.length,
    });
    return { ...written, fullFiles };
  });

  // Export the complete document *and* the per-section files with one dialog.
  ipcMain.handle(
    IPC_CHANNELS.FILE_EXPORT_BUNDLE,
    async (event, payload: ExportBundlePayload): Promise<ExportBundleResult | null> => {
      log.info('[File][IPC] file:exportBundle', {
        projectId: payload.projectId,
        documentId: payload.documentId,
      });
      const doc = resolveSplitDocument(engine, payload.projectId, payload.documentId);
      if (!doc) {
        log.warn('[File][IPC] file:exportBundle - document not found', payload);
        return null;
      }

      const win = BrowserWindow.fromWebContents(event.sender);
      const dirResult = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory', 'createDirectory'],
        title: ui.backend.chooseOutputDirectory,
      });
      if (dirResult.canceled || dirResult.filePaths.length === 0) return null;

      const destDir = dirResult.filePaths[0];
      const state = engine.getState(payload.projectId);
      const plan = buildSplitPlan(doc.content, doc.title);
      const fullFiles = await copyFullDocuments(state, doc.id, destDir);
      const splitOptions: SplitExportOptions = payload.split ?? {
        selected: plan.split.sections.map((section) => section.index),
        formats: ['dita'],
        includeIntro: 'none',
        createMap: false,
        titleFromSection: false,
      };
      const written = await writeSplitFiles(doc, splitOptions, destDir);

      log.info('[File][IPC] file:exportBundle - done', {
        destDir,
        full: fullFiles.length,
        split: written?.files.length ?? 0,
      });
      return {
        destDir,
        fullFiles,
        splitDir: written?.destDir ?? null,
        splitFiles: written?.files ?? [],
        warnings: plan.warnings,
      };
    }
  );
}
