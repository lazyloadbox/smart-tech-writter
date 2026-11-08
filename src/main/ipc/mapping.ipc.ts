import { ipcMain, dialog, BrowserWindow } from 'electron';
import ExcelJS from 'exceljs';
import log from 'electron-log';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type {
  MappingAddPayload,
  MappingBatchUndoPayload,
  MappingDeletePayload,
  MappingImportOptionsPayload,
  MappingListPayload,
  MappingRestorePayload,
  MappingUpdatePayload,
} from '../../shared/types/ipc.types';
import type {
  GlossaryColumnOverride,
  GlossaryParseResult,
  MappingImportParseResult,
  MappingImportPlanResult,
} from '../../shared/types/mapping.types';
import { parseGlossaryFile } from '../modules/glossary/file-parser';
import type { MappingService } from '../modules/localization/mapping.service';
import { en as ui } from '../../shared/i18n';

/** Parsed import sessions are cached for 10 minutes (or until imported). */
const PARSE_TTL_MS = 10 * 60 * 1000;

interface ParseCacheEntry {
  filePath: string;
  parsed: GlossaryParseResult;
  expiresAt: number;
}

/**
 * Import parse sessions keyed by `parseId`. The renderer only sends the id
 * back, so large files never cross the process boundary twice and the
 * renderer cannot tamper with the imported rows (design §2.4.1).
 */
const parseCache = new Map<string, ParseCacheEntry>();

function cleanupParseCache(): void {
  const now = Date.now();
  for (const [id, entry] of parseCache) {
    if (entry.expiresAt < now) parseCache.delete(id);
  }
}

/** Find a cached parse session or throw a user-facing error. */
function requireParseEntry(parseId: string): ParseCacheEntry {
  cleanupParseCache();
  const entry = parseCache.get(parseId);
  if (!entry) {
    throw new Error('The import session has expired. Select the file again to continue.');
  }
  return entry;
}

/** Re-parse the file when the user changed the sheet or column mapping. */
async function resolveParsed(
  entry: ParseCacheEntry,
  options: { sheetIndex?: number; columnOverride?: GlossaryColumnOverride }
): Promise<GlossaryParseResult> {
  if (options.sheetIndex === undefined && !options.columnOverride) {
    return entry.parsed;
  }
  const parsed = await parseGlossaryFile(entry.filePath, {
    sheetIndex: options.sheetIndex ?? entry.parsed.sheetIndex,
    columnOverride: options.columnOverride,
  });
  entry.parsed = parsed;
  return parsed;
}

export function registerMappingHandlers(service: MappingService): void {
  ipcMain.handle(IPC_CHANNELS.MAPPING_LIST, async (_event, payload: MappingListPayload) => {
    return service.listMappings({
      search: payload?.search,
      offset: payload?.offset,
      limit: payload?.limit,
      kind: payload?.kind,
    });
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_ADD, async (_event, payload: MappingAddPayload) => {
    log.info('[Mapping][IPC] mapping:add', { en: payload.en });
    return service.addMapping(
      payload.en,
      payload.zhCN,
      payload.zhTW,
      payload.kind,
      payload.doNotUse
    );
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_UPDATE, async (_event, payload: MappingUpdatePayload) => {
    log.info('[Mapping][IPC] mapping:update', { id: payload.id });
    return service.updateMapping(
      payload.id,
      payload.en,
      payload.zhCN,
      payload.zhTW,
      payload.kind,
      payload.doNotUse
    );
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_DELETE, async (_event, payload: MappingDeletePayload) => {
    service.deleteMapping(payload.id);
  });

  /** P4-1: list glossary backup files (newest first). */
  ipcMain.handle(IPC_CHANNELS.MAPPING_BACKUPS, async () => {
    const items = service.listBackups();
    log.info('[Mapping][IPC] mapping:backups', { count: items.length });
    return { items };
  });

  /** P4-1: restore one backup file (the current table is backed up first). */
  ipcMain.handle(IPC_CHANNELS.MAPPING_RESTORE, async (_event, payload: MappingRestorePayload) => {
    const result = service.restoreBackup(payload.fileName);
    log.info('[Mapping][IPC] mapping:restore', { fileName: payload.fileName, ...result });
    return result;
  });

  /** P4-2: list applied import batches. */
  ipcMain.handle(IPC_CHANNELS.MAPPING_BATCHES, async () => {
    const items = service.listBatches();
    log.info('[Mapping][IPC] mapping:batches', { count: items.length });
    return { items };
  });

  /** P4-2: undo one import batch. */
  ipcMain.handle(IPC_CHANNELS.MAPPING_BATCH_UNDO, async (_event, payload: MappingBatchUndoPayload) => {
    const result = service.undoBatch(payload.batchId);
    log.info('[Mapping][IPC] mapping:batchUndo', result);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_STATS, async () => {
    return service.getStats();
  });

  /**
   * Open a file dialog, parse the selected Excel/CSV file, cache the result
   * and return the detected columns + a first import plan (append/overwrite).
   */
  ipcMain.handle(IPC_CHANNELS.MAPPING_IMPORT_PARSE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel / CSV', extensions: ['xlsx', 'csv'] },
        { name: ui.backend.excelWorkbook, extensions: ['xlsx'] },
        { name: 'CSV', extensions: ['csv'] },
      ],
      title: ui.backend.chooseGlossaryFile,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];

    try {
      cleanupParseCache();
      const parsed = await parseGlossaryFile(filePath);
      const parseId = randomUUID();
      parseCache.set(parseId, {
        filePath,
        parsed,
        expiresAt: Date.now() + PARSE_TTL_MS,
      });
      const { plan } = service.planImport(parsed.rows, 'append', 'overwrite', false);
      log.info('[Mapping][IPC] mapping:importParse', {
        fileName: parsed.fileName,
        rows: parsed.rows.length,
        sheet: parsed.sheets[parsed.sheetIndex],
        detectedBy: parsed.columns.detectedBy,
      });

      const response: MappingImportParseResult = {
        parseId,
        fileName: parsed.fileName,
        sheets: parsed.sheets,
        sheetIndex: parsed.sheetIndex,
        columns: parsed.columns,
        preview: parsed.rows.slice(0, 20),
        plan,
        warnings: parsed.warnings,
      };
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('[Mapping][IPC] mapping:importParse failed', { error: message });
      throw new Error(message);
    }
  });

  /** Recompute the import plan after the user changes mode / strategy / mapping. */
  ipcMain.handle(
    IPC_CHANNELS.MAPPING_IMPORT_PLAN,
    async (_event, payload: MappingImportOptionsPayload): Promise<MappingImportPlanResult> => {
      const entry = requireParseEntry(payload.parseId);
      const parsed = await resolveParsed(entry, payload);
      const { plan } = service.planImport(
        parsed.rows,
        payload.mode,
        payload.strategy,
        payload.keepDefaults
      );
      return {
        parseId: payload.parseId,
        sheets: parsed.sheets,
        sheetIndex: parsed.sheetIndex,
        columns: parsed.columns,
        preview: parsed.rows.slice(0, 20),
        plan,
        warnings: parsed.warnings,
      };
    }
  );

  /** Apply the import. The rows come from the main-process cache only. */
  ipcMain.handle(IPC_CHANNELS.MAPPING_IMPORT, async (_event, payload: MappingImportOptionsPayload) => {
    const entry = requireParseEntry(payload.parseId);
    const parsed = await resolveParsed(entry, payload);
    const result = service.applyImport(
      parsed.fileName,
      parsed.rows,
      payload.mode,
      payload.strategy,
      payload.keepDefaults
    );
    parseCache.delete(payload.parseId);
    return result;
  });

  /** Export the whole glossary as a four-column .xlsx workbook. */
  ipcMain.handle(IPC_CHANNELS.MAPPING_EXPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win!, {
      title: ui.settings.exportGlossaryDialogTitle,
      defaultPath: `glossary-${stamp}.xlsx`,
      filters: [{ name: ui.backend.excelWorkbook, extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return null;

    const rows = service.listAllMappings();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Glossary');
    sheet.columns = [
      { header: 'No.', key: 'no', width: 8 },
      { header: 'en-US', key: 'en', width: 42 },
      { header: 'zh-CN', key: 'zhCN', width: 28 },
      { header: 'zh-TW', key: 'zhTW', width: 28 },
      { header: 'Do not use', key: 'doNotUse', width: 24 },
      { header: 'Kind', key: 'kind', width: 10 },
      { header: 'Origin', key: 'origin', width: 10 },
    ];
    rows.forEach((row, index) => {
      sheet.addRow({
        no: row.seqNo ?? index + 1,
        en: row.en,
        zhCN: row.zhCN,
        zhTW: row.zhTW,
        doNotUse: (row.doNotUse ?? []).join('; '),
        kind: row.kind,
        origin: row.origin,
      });
    });
    await workbook.xlsx.writeFile(result.filePath);
    log.info('[Mapping][IPC] mapping:export', {
      file: path.basename(result.filePath),
      rows: rows.length,
    });
    return result.filePath;
  });
}
