import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type {
  MappingListPayload,
  MappingAddPayload,
  MappingUpdatePayload,
  MappingDeletePayload,
  MappingImportPayload,
} from '../../shared/types/ipc.types';
import type { MappingImportRow } from '../../shared/types/mapping.types';
import type { MappingService } from '../modules/localization/mapping.service';

/** Common header names for the first column — when matched, the first row is skipped. */
const HEADER_RE =
  /^(source|english|term|key|en|source_text|source text|原文|英文|术语|关键词|源文本|source\s*\(en\))$/i;

/** Convert an exceljs cell value to a plain string. */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as { text?: unknown; richText?: { text: string }[]; hyperlink?: unknown; result?: unknown };
    if (typeof obj.text === 'string') return obj.text.trim();
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('').trim();
    if (obj.result != null) return String(obj.result).trim();
  }
  return '';
}

/**
 * Parse a .xlsx workbook: first sheet, first three columns =
 * English / 简体中文 / 繁體中文.
 */
async function parseXlsx(filePath: string): Promise<MappingImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: MappingImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    const en = cellToString(row.getCell(1).value);
    const zhCN = cellToString(row.getCell(2).value);
    const zhTW = cellToString(row.getCell(3).value);
    if (rowNumber === 1 && HEADER_RE.test(en)) return; // header row
    if (!en && !zhCN && !zhTW) return; // skip fully empty rows
    rows.push({ en, zhCN, zhTW });
  });
  return rows;
}

/** Minimal robust CSV parser: BOM, quoted fields, escaped quotes, CRLF/LF. */
function parseCsv(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Last field/row (no trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse a .csv file: first three columns = English / 简体中文 / 繁體中文. */
function parseCsvFile(filePath: string): MappingImportRow[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseCsv(text);
  const rows: MappingImportRow[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const cells = parsed[i];
    const en = (cells[0] ?? '').trim();
    const zhCN = (cells[1] ?? '').trim();
    const zhTW = (cells[2] ?? '').trim();
    if (i === 0 && HEADER_RE.test(en)) continue; // header row
    if (!en && !zhCN && !zhTW) continue;
    rows.push({ en, zhCN, zhTW });
  }
  return rows;
}

/** Parse an import file (.xlsx / .csv) into three-column rows. */
export async function parseMappingFile(filePath: string): Promise<MappingImportRow[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return parseXlsx(filePath);
  }
  if (ext === '.csv') {
    return parseCsvFile(filePath);
  }
  throw new Error(`不支持的文件格式：${ext || '(无扩展名)'}（仅支持 .xlsx / .csv）`);
}

export function registerMappingHandlers(service: MappingService): void {
  ipcMain.handle(IPC_CHANNELS.MAPPING_LIST, async (_event, payload: MappingListPayload) => {
    return service.listMappings(payload?.search);
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_ADD, async (_event, payload: MappingAddPayload) => {
    log.info('[Mapping][IPC] mapping:add', { en: payload.en });
    return service.addMapping(payload.en, payload.zhCN, payload.zhTW);
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_UPDATE, async (_event, payload: MappingUpdatePayload) => {
    log.info('[Mapping][IPC] mapping:update', { id: payload.id });
    return service.updateMapping(payload.id, payload.en, payload.zhCN, payload.zhTW);
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_DELETE, async (_event, payload: MappingDeletePayload) => {
    service.deleteMapping(payload.id);
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_STATS, async () => {
    return service.getStats();
  });

  /**
   * Open a file dialog, parse the selected Excel/CSV file and return the
   * parsed rows so the renderer can preview them before importing.
   */
  ipcMain.handle(IPC_CHANNELS.MAPPING_IMPORT_PARSE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] },
        { name: 'Excel 工作簿', extensions: ['xlsx', 'xls'] },
        { name: 'CSV', extensions: ['csv'] },
      ],
      title: '选择要导入的翻译映射文件（第一列=英文，第二列=简体中文，第三列=台湾繁体）',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    try {
      const rows = await parseMappingFile(filePath);
      log.info('[Mapping][IPC] mapping:importParse', {
        fileName: path.basename(filePath),
        rowCount: rows.length,
      });
      return { fileName: path.basename(filePath), rows };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('[Mapping][IPC] mapping:importParse failed', { error: message });
      throw new Error(message);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MAPPING_IMPORT, async (_event, payload: MappingImportPayload) => {
    log.info('[Mapping][IPC] mapping:import', { rowCount: payload.rows?.length ?? 0 });
    return service.importMappings(payload.rows ?? []);
  });
}