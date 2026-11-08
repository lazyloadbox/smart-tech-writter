// Glossary import file parser (P1-4).
//
// Reads `.xlsx` / `.csv` glossary exports and maps their columns onto the
// logical columns `seq / en / zhCN / zhTW` in two ways:
//
//   1. Header detection  — look at the first five non-empty rows for a header
//      row (e.g. `No. | en-US | zh-CN` or `English | 简体中文 | 繁體中文`).
//      Rows up to and including the header are skipped.
//   2. Position fallback — when no header is found, inspect the first column:
//      mostly positive integers → `seq / en / zhCN`, otherwise the legacy
//      `en / zhCN / zhTW` layout.
//
// The parser is deliberately free of Electron imports so it can run in vitest.
// Excel reading still uses the `exceljs` dependency already shipped for the
// historical importer.

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type {
  GlossaryColumnMap,
  GlossaryColumnOverride,
  GlossaryParseResult,
  ParsedGlossaryRow,
} from '../../../shared/types/mapping.types';
import { cleanCellText } from './normalize';

/** One physical row of the sheet with 1-based row number and raw cells. */
interface RawRow {
  row: number;
  cells: string[];
}

/** Options accepted by {@link parseGlossaryFile}. */
export interface ParseGlossaryOptions {
  /** 0-based sheet index for `.xlsx` files (default 0). */
  sheetIndex?: number;
  /** Manual column mapping chosen in the preview dialog. */
  columnOverride?: GlossaryColumnOverride;
}

/** Normalize a header cell for alias matching: lowercase, strip punctuation. */
function headerKey(value: string): string {
  return cleanCellText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
}

/** Header aliases per logical column (design §2.4.2). */
const HEADER_ALIASES: Record<'seq' | 'en' | 'zhCN' | 'zhTW' | 'forbidden', string[]> = {
  seq: ['no', 'number', 'num', 'seq', 'seqno', 'index', 'id', '序号', '编号', '#'],
  en: [
    'enus',
    'en',
    'eng',
    'english',
    'englishus',
    'source',
    'sourcetext',
    'term',
    '原文',
    '英文',
    '术语',
    'sourceen',
  ],
  zhCN: ['zhcn', 'zhhans', 'chinese', 'chs', '简体中文', '简体', '中文', '中文简体'],
  zhTW: ['zhtw', 'zhhant', 'traditional', 'cht', '繁體中文', '繁体中文', '繁體', '繁体'],
  // P4-6: optional "Do not use" column.
  forbidden: [
    'donotuse',
    'donotuseen',
    'forbidden',
    'avoid',
    'deprecated',
    'banned',
    '禁用写法',
    '禁用',
    '禁止使用',
    '禁用词',
    '不使用',
  ],
};

function matchHeaderCell(cell: string): 'seq' | 'en' | 'zhCN' | 'zhTW' | 'forbidden' | null {
  const key = headerKey(cell);
  if (!key) return null;
  for (const column of ['seq', 'en', 'zhCN', 'zhTW', 'forbidden'] as const) {
    if (HEADER_ALIASES[column].includes(key)) return column;
  }
  return null;
}

/**
 * Split one `Do not use` cell into individual forbidden wordings (P4-6).
 * Accepts newline / `;` / `|` / `、` separators so a single cell can list
 * several deprecated variants without needing extra columns.
 */
export function parseForbiddenCell(value: string): string[] {
  const cleaned = cleanCellText(value);
  if (!cleaned) return [];
  const parts = cleaned
    .split(/[\n;|、]+|\s*\/\s*/)
    .map((part) => cleanCellText(part))
    .filter(Boolean);
  // De-duplicate case-insensitively while keeping the original casing.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/** Convert an exceljs cell value (string / rich text / formula / hyperlink) to text. */
export function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return cleanCellText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as {
      text?: unknown;
      richText?: { text: string }[];
      hyperlink?: unknown;
      result?: unknown;
    };
    if (typeof obj.text === 'string') return cleanCellText(obj.text);
    if (Array.isArray(obj.richText)) {
      return cleanCellText(obj.richText.map((r) => r.text).join(''));
    }
    if (obj.result != null) return cleanCellText(String(obj.result));
  }
  return '';
}

/** Minimal robust CSV parser: BOM, quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
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

/** Build the raw row matrix of an exceljs worksheet without losing row numbers. */
function worksheetToRows(sheet: ExcelJS.Worksheet): RawRow[] {
  const rows: RawRow[] = [];
  const columnCount = Math.max(sheet.columnCount, 1);
  const rowCount = sheet.rowCount;
  for (let r = 1; r <= rowCount; r++) {
    const excelRow = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= columnCount; c++) {
      cells.push(cellToString(excelRow.getCell(c).value));
    }
    rows.push({ row: r, cells });
  }
  return rows;
}

/** True when every cell is empty after cleaning. */
function isEmptyRow(cells: string[]): boolean {
  return cells.every((c) => c === '');
}

/** True when the cell is a positive integer (used by the position fallback). */
function isPositiveInt(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Detect the header row within the first five non-empty rows.
 * Returns `null` when no row contains both an English alias and at least one
 * other recognized alias.
 */
function detectHeaderRow(rows: RawRow[]): GlossaryColumnMap | null {
  const candidates = rows.filter((r) => !isEmptyRow(r.cells)).slice(0, 5);
  for (const candidate of candidates) {
    const found: Partial<Record<'seq' | 'en' | 'zhCN' | 'zhTW' | 'forbidden', number>> = {};
    let matched = 0;
    candidate.cells.forEach((cell, index) => {
      const column = matchHeaderCell(cell);
      if (column && found[column] === undefined) {
        found[column] = index;
        matched++;
      }
    });
    if (matched >= 2 && found.en !== undefined) {
      return {
        seq: found.seq,
        en: found.en,
        zhCN: found.zhCN,
        zhTW: found.zhTW,
        forbidden: found.forbidden,
        detectedBy: 'header',
        headerRow: candidate.row,
      };
    }
  }
  return null;
}

/**
 * Positional fallback: when the first column is mostly integers we assume the
 * new `No. / en-US / zh-CN` layout, otherwise the legacy `en / zhCN / zhTW`.
 */
function detectByPosition(rows: RawRow[]): GlossaryColumnMap {
  const nonEmpty = rows.filter((r) => !isEmptyRow(r.cells));
  const numeric = nonEmpty.filter((r) => isPositiveInt(r.cells[0] ?? '')).length;
  const isSeqLayout = nonEmpty.length > 0 && numeric / nonEmpty.length >= 0.8;
  if (isSeqLayout) {
    return { seq: 0, en: 1, zhCN: 2, detectedBy: 'position' };
  }
  return { en: 0, zhCN: 1, zhTW: 2, detectedBy: 'position' };
}

function applyOverride(
  detected: GlossaryColumnMap,
  override?: GlossaryColumnOverride,
): GlossaryColumnMap {
  if (!override) return detected;
  const merged: GlossaryColumnMap = {
    ...detected,
    ...Object.fromEntries(
      Object.entries(override).filter(([, value]) => value !== undefined),
    ),
    detectedBy: 'manual',
  };
  return merged;
}

/** Extract `seq / en / zhCN / zhTW` from the raw rows using a column map. */
function extractRows(
  rows: RawRow[],
  columns: GlossaryColumnMap,
  warnings: string[],
): ParsedGlossaryRow[] {
  const result: ParsedGlossaryRow[] = [];
  for (const raw of rows) {
    if (columns.headerRow !== undefined && raw.row <= columns.headerRow) continue;
    if (isEmptyRow(raw.cells)) continue;
    const get = (index: number | undefined): string =>
      index === undefined ? '' : cleanCellText(raw.cells[index] ?? '');

    const en = get(columns.en);
    const zhCN = get(columns.zhCN);
    const zhTW = get(columns.zhTW);
    const doNotUse = parseForbiddenCell(get(columns.forbidden));
    if (!en && !zhCN && !zhTW) continue;

    const seqText = get(columns.seq);
    const parsed: ParsedGlossaryRow = {
      row: raw.row,
      en,
      zhCN,
      zhTW,
    };
    if (doNotUse.length > 0) parsed.doNotUse = doNotUse;
    if (seqText && isPositiveInt(seqText)) parsed.seq = Number(seqText);
    result.push(parsed);
  }
  if (result.length === 0) {
    warnings.push('No data rows were detected in the selected sheet.');
  }
  return result;
}

/** Read raw rows from a workbook sheet or CSV file. */
function readCsvRows(filePath: string): { rows: RawRow[]; warnings: string[] } {
  const text = fs.readFileSync(filePath, 'utf-8');
  const matrix = parseCsv(text);
  const warnings: string[] = [];
  if (text.includes('\uFEFF') && !text.startsWith('\uFEFF')) {
    warnings.push('CSV contains a byte-order mark in the middle of the file.');
  }
  return {
    rows: matrix.map((cells, index) => ({ row: index + 1, cells })),
    warnings,
  };
}

/**
 * Parse a glossary import file into a column map + data rows.
 *
 * @throws when the extension is unsupported or no English column is found.
 */
export async function parseGlossaryFile(
  filePath: string,
  options: ParseGlossaryOptions = {},
): Promise<GlossaryParseResult> {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const warnings: string[] = [];

  let sheets: string[] = [fileName];
  let sheetIndex = 0;
  let rawRows: RawRow[];

  if (ext === '.xlsx' || ext === '.xlsm') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    sheets = workbook.worksheets.map((s) => s.name);
    if (sheets.length === 0) throw new Error('The workbook contains no worksheets.');
    sheetIndex = Math.min(Math.max(options.sheetIndex ?? 0, 0), sheets.length - 1);
    if (options.sheetIndex !== undefined && options.sheetIndex !== sheetIndex) {
      warnings.push(`Sheet index ${options.sheetIndex} is out of range; using sheet ${sheetIndex}.`);
    }
    const sheet = workbook.worksheets[sheetIndex];
    rawRows = worksheetToRows(sheet);
  } else if (ext === '.csv') {
    const csv = readCsvRows(filePath);
    rawRows = csv.rows;
    warnings.push(...csv.warnings);
  } else if (ext === '.xls') {
    throw new Error(
      'Legacy .xls (BIFF8) workbooks are not supported. Re-save the file as .xlsx and try again.',
    );
  } else {
    throw new Error(`Unsupported file format: ${ext || '(no extension)'}. Supported formats: .xlsx and .csv.`);
  }

  const header = detectHeaderRow(rawRows);
  const detected = header ?? detectByPosition(rawRows);
  const columns = applyOverride(detected, options.columnOverride);

  if (typeof columns.en !== 'number') {
    throw new Error('No English column was detected. Choose the English column manually.');
  }
  if (columns.detectedBy === 'position') {
    warnings.push(
      'No header row was found; columns were inferred from their position. Verify the mapping before importing.',
    );
  }

  const rows = extractRows(rawRows, columns, warnings);

  return {
    fileName,
    sheets,
    sheetIndex,
    columns,
    rows,
    warnings,
  };
}

/**
 * List the sheet names of an Excel workbook (used to populate the preview
 * dialog when the detector picked the wrong sheet). Returns a single entry for
 * CSV files and an empty array for unreadable files.
 */
export async function listGlossarySheets(filePath: string): Promise<string[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return [path.basename(filePath)];
  if (ext !== '.xlsx' && ext !== '.xlsm') return [];
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    return workbook.worksheets.map((s) => s.name);
  } catch {
    return [];
  }
}
