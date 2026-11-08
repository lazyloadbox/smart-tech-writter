// Generates the P0-1 glossary import fixtures used by the import/parse tests
// (P1) and by manual verification of the "No. / en-US / zh-CN" Excel format.
//
//   node test/mock-case-02/generate-sample.mjs
//
// Produces (all deterministic):
//   glossary-sample.xlsx   — realistic workbook: banner row, styled header,
//                            duplicates, conflicts, blank rows, missing cells,
//                            zero-width chars, NBSP, rich-text cells, plus
//                            legacy and header-less sheets.
//   glossary-sample.csv    — CSV variant (BOM + CRLF + quoted comma field).
//   glossary-legacy.csv    — legacy 3-column CSV (English/简体中文/繁體中文).
//   manifest.json          — fixture layout + the expected classification of
//                            every term row (reference truth for tests).
//
// The classification below intentionally reimplements the normalization rules
// from the design doc (§2.4.3) so the manifest can state "which rows a correct
// importer must merge" independently of the (not yet written) P1 parser.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Reference normalization (design §2.4.3) ────────────────────────────────
const cleanCell = (s) =>
  String(s ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');

const normalizeEn = (s) =>
  cleanCell(s)
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。;；:：]+$/, '')
    .toLowerCase();

const normalizeZh = (s) => cleanCell(s).normalize('NFKC').replace(/\s+/g, '').trim();

// ── "Terms" sheet content ──────────────────────────────────────────────────
// `kind` is the intended classification of the row inside the file:
//   new          → first occurrence of this en_key
//   dupInFile    → same en_key + same zh-CN (auto-merge, first row kept)
//   conflictInFile → same en_key + different zh-CN (conflict strategy decides)
//   invalid      → en empty (cannot be imported)
const TERM_ROWS = [
  { no: 1, en: 'Duty cycle', zhCN: '占空比', kind: 'new' },
  { no: 2, en: 'PWM (Pulse Width Modulation)', zhCN: '脉宽调制', kind: 'new' },
  { no: 3, en: 'Duty cycle', zhCN: '占空比', kind: 'dupInFile' },
  {
    no: 4,
    en: { richText: [{ text: 'Duty ' }, { text: '  Cycle', font: { bold: true } }] },
    enPlain: 'Duty   Cycle',
    zhCN: '占空比',
    kind: 'dupInFile', // whitespace-only difference → same en_key
  },
  { no: 5, en: 'Duty cycle', zhCN: '占空比寄存器', kind: 'conflictInFile' },
  { blank: true }, // fully empty row (must be skipped, not an error)
  { no: 6, en: 'Dead time', zhCN: '死区时间', kind: 'new' },
  { no: 7, en: 'Dead   time', zhCN: '死区时间', kind: 'dupInFile' },
  {
    no: 8,
    en: 'dead-time',
    zhCN: '死区时间',
    kind: 'new',
    note: 'hyphen variant: a distinct en_key at import time; merged later by the L2 alias layer',
  },
  { no: 9, en: 'Reset', zhCN: '复位', kind: 'new' },
  { no: 10, en: 'Restore', zhCN: '恢复', kind: 'new' },
  {
    no: 11,
    en: { richText: [{ text: 'Firmware ' }, { text: 'update', font: { italic: true } }] },
    enPlain: 'Firmware update',
    zhCN: '固件升级',
    kind: 'new',
    note: 'rich-text cell (exceljs richText)',
  },
  { no: 12, en: '', zhCN: '仅中文条目', kind: 'invalid' },
  {
    no: 13,
    en: 'ESP32 PWM controller',
    zhCN: '',
    kind: 'new',
    note: 'missing zh-CN: valid term-only entry under the new schema',
  },
  {
    no: 14,
    en: 'Zero\u200BWidth timer',
    zhCN: '零宽字符定时器',
    kind: 'new',
    note: 'zero-width space in en must be stripped before matching',
  },
  {
    no: 15,
    en: 'LEDC',
    zhCN: '外设\u00A0时钟',
    kind: 'new',
    note: 'NBSP in zh-CN must be normalized away',
  },
  {
    no: 16,
    en: 'Duty cycle.',
    zhCN: '占空比',
    kind: 'dupInFile',
    note: 'trailing punctuation stripped from en → same en_key as row 1',
  },
];

const LEGACY_ROWS = [
  { en: 'Technical documentation', zhCN: '技术文档', zhTW: '技術文件' },
  { en: 'Test specification', zhCN: '测试规范', zhTW: '測試規範' },
  { en: 'Scope', zhCN: '范围', zhTW: '範圍' },
  { en: 'Channel', zhCN: '通道', zhTW: '通道' },
  { en: 'Table', zhCN: '表格', zhTW: '', note: 'missing zh-TW → old importer skips it' },
];

const NO_HEADER_ROWS = [
  { no: 1, en: 'Bootloader', zhCN: '引导程序' },
  { no: 2, en: 'Watchdog timer', zhCN: '看门狗定时器' },
  { no: 3, en: 'Interrupt', zhCN: '中断' },
];

// ── Classification + stats (reference truth) ───────────────────────────────
function classify(rows) {
  const seen = new Map(); // enKey → { zhCN, row }
  const stats = { new: 0, dupInFile: 0, conflictInFile: 0, invalid: 0 };
  const detail = [];

  rows.forEach((row, index) => {
    const sheetRow = 3 + index; // 1 = banner, 2 = header
    if (row.blank) {
      detail.push({ row: sheetRow, kind: 'blank', enKey: '', resolution: 'skipped' });
      return;
    }
    const en = row.enPlain ?? cleanCell(typeof row.en === 'string' ? row.en : '');
    const enKey = normalizeEn(en);
    const zhKey = normalizeZh(row.zhCN);

    let kind = row.kind;
    if (!enKey) kind = 'invalid';
    else if (seen.has(enKey)) {
      const prev = seen.get(enKey);
      kind = prev.zhKey === zhKey ? 'dupInFile' : 'conflictInFile';
    } else {
      kind = 'new';
      seen.set(enKey, { zhKey, row: row.no });
    }

    stats[kind] += 1;
    detail.push({
      row: sheetRow,
      no: row.no,
      en,
      enKey,
      zhCN: row.zhCN,
      kind,
      resolution:
        kind === 'new' ? 'insert' : kind === 'invalid' ? 'skipped' : kind === 'conflictInFile' ? 'strategy' : 'merged',
      ...(row.note ? { note: row.note } : {}),
    });

    // Expected declaration mismatches are fixture bugs — fail loudly.
    if (row.kind && row.kind !== kind) {
      throw new Error(`fixture row ${row.no}: declared ${row.kind} but classified as ${kind}`);
    }
  });
  return { stats, detail };
}

// ── Workbook generation ────────────────────────────────────────────────────
function toCellValue(en) {
  return typeof en === 'string' ? en : en;
}

async function buildWorkbook(filePath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'smart-tech-writer P0-1 fixture generator';
  wb.created = new Date('2026-11-08T00:00:00Z');
  wb.modified = new Date('2026-11-08T00:00:00Z');

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  const headerFont = { bold: true };
  const thin = { style: 'thin', color: { argb: 'FF9E9E9E' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // Sheet 1 — the realistic new-format export (banner + header + messy rows).
  const terms = wb.addWorksheet('Terms');
  terms.columns = [
    { width: 8 },
    { width: 38 },
    { width: 26 },
  ];

  terms.mergeCells('A1:C1');
  const banner = terms.getCell('A1');
  banner.value = 'ESP32 PWM 术语表 / Glossary (en-US → zh-CN)';
  banner.font = { bold: true, size: 14 };
  banner.alignment = { horizontal: 'center' };

  const headerRow = terms.addRow(['No.', 'en-US', 'zh-CN']);
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = border;
  });

  for (const row of TERM_ROWS) {
    if (row.blank) {
      terms.addRow([]); // fully empty row
      continue;
    }
    const added = terms.addRow([row.no, toCellValue(row.en), row.zhCN]);
    added.eachCell((cell) => {
      cell.border = border;
    });
  }

  // Sheet 2 — legacy three-column export (English / 简体中文 / 繁體中文).
  const legacy = wb.addWorksheet('Legacy3Col');
  legacy.columns = [{ width: 30 }, { width: 18 }, { width: 18 }];
  const legacyHeader = legacy.addRow(['English', '简体中文', '繁體中文']);
  legacyHeader.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
  });
  for (const row of LEGACY_ROWS) {
    legacy.addRow([row.en, row.zhCN, row.zhTW]);
  }

  // Sheet 3 — new format without a header row (first column is numeric).
  const noHeader = wb.addWorksheet('NoHeader');
  noHeader.columns = [{ width: 8 }, { width: 28 }, { width: 20 }];
  for (const row of NO_HEADER_ROWS) {
    noHeader.addRow([row.no, row.en, row.zhCN]);
  }

  await wb.xlsx.writeFile(filePath);
}

// ── CSV generation ─────────────────────────────────────────────────────────
function writeCsv(filePath, rows, { bom = false, eol = '\r\n' } = {}) {
  const text = rows
    .map((cells) =>
      cells
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join(eol) + eol;
  fs.writeFileSync(filePath, (bom ? '\uFEFF' : '') + text, 'utf-8');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(here, { recursive: true });

  const xlsxPath = path.join(here, 'glossary-sample.xlsx');
  await buildWorkbook(xlsxPath);

  // CSV variant of the new format: no header, quoted field containing a comma.
  const csvRows = [
    ['No.', 'en-US', 'zh-CN'],
    [1, 'Duty cycle', '占空比'],
    [2, 'PWM (Pulse Width Modulation)', '脉宽调制'],
    [3, 'Firmware update', '固件升级, 固件更新'],
    [4, 'LEDC', '外设时钟'],
  ];
  const csvPath = path.join(here, 'glossary-sample.csv');
  writeCsv(csvPath, csvRows, { bom: true, eol: '\r\n' });

  const legacyCsvPath = path.join(here, 'glossary-legacy.csv');
  writeCsv(
    legacyCsvPath,
    [
      ['English', '简体中文', '繁體中文'],
      ['Technical documentation', '技术文档', '技術文件'],
      ['Test specification', '测试规范', '測試規範'],
    ],
    { bom: false, eol: '\r\n' },
  );

  const terms = classify(TERM_ROWS);
  const manifest = {
    generatedBy: 'test/mock-case-02/generate-sample.mjs',
    generatedAt: '2026-11-08',
    purpose:
      'P0-1 realistic glossary import fixture: banner + styled header, in-file duplicates, ' +
      'conflict, blank row, invalid row, missing zh-CN, trailing punctuation, zero-width and NBSP characters, ' +
      'rich-text cells; plus a legacy 3-column sheet and a header-less sheet.',
    files: {
      'glossary-sample.xlsx': {
        sheets: {
          Terms: {
            layout: 'row1 = merged banner, row2 = header No./en-US/zh-CN, row3+ = data',
            headerRow: 2,
            dataRowCount: TERM_ROWS.length,
            nonEmptyDataRows: TERM_ROWS.filter((r) => !r.blank).length,
            blankRows: TERM_ROWS.map((row, index) => (row.blank ? 3 + index : null)).filter((row) => row !== null),
            expected: terms.stats,
            rows: terms.detail,
          },
          Legacy3Col: {
            layout: 'row1 = header English/简体中文/繁體中文, row2+ = data',
            headerRow: 1,
            dataRowCount: LEGACY_ROWS.length,
            note: 'row 5 has an empty zh-TW cell: the old importer drops it, the new schema must keep the term',
          },
          NoHeader: {
            layout: 'no header row; column 1 is a numeric No.',
            dataRowCount: NO_HEADER_ROWS.length,
            note: 'positional fallback must detect seq/en/zhCN because column 1 is mostly integers',
          },
        },
      },
      'glossary-sample.csv': {
        layout: 'header No.,en-US,zh-CN; BOM; CRLF; one quoted field containing a comma',
        dataRowCount: csvRows.length - 1,
      },
      'glossary-legacy.csv': {
        layout: 'header English,简体中文,繁體中文; CRLF',
        dataRowCount: 2,
      },
    },
    expectations: {
      enKeyExample: {
        'Duty cycle': normalizeEn('Duty cycle'),
        'Duty cycle.': normalizeEn('Duty cycle.'),
        'Duty   Cycle': normalizeEn('Duty   Cycle'),
      },
      notes: [
        'Rows 3, 4 and 16 must collapse into row 1 (same en_key, same zh-CN).',
        'Row 5 conflicts with row 1 (same en_key, different zh-CN) and must be reported as conflictInFile.',
        'Row 8 (dead-time) is a distinct en_key at import time; hyphen/space aliasing happens in the L2 layer.',
        'Row 12 has no English cell → invalid row, reported with its 1-based source row number.',
        'Row 13 has no zh-CN cell → still importable under the new schema (zh-CN may be empty).',
      ],
    },
  };
  fs.writeFileSync(path.join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  // Read back the workbook to prove the fixture is valid and summarise it.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  console.log(`✔ wrote ${path.relative(process.cwd(), xlsxPath)}`);
  for (const sheet of wb.worksheets) {
    console.log(`  · sheet "${sheet.name}": ${sheet.rowCount} rows × ${sheet.columnCount} cols`);
  }
  console.log(`  · Terms expected: ${JSON.stringify(terms.stats)}`);
  console.log(`✔ wrote ${path.relative(process.cwd(), csvPath)}`);
  console.log(`✔ wrote ${path.relative(process.cwd(), legacyCsvPath)}`);
  console.log('✔ wrote manifest.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
