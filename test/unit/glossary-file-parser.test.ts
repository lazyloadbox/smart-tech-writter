import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlossaryFile } from '../../src/main/modules/glossary/file-parser';

const FIXTURE_DIR = path.resolve(__dirname, '../mock-case-02');
const XLSX = path.join(FIXTURE_DIR, 'glossary-sample.xlsx');
const CSV = path.join(FIXTURE_DIR, 'glossary-sample.csv');
const LEGACY_CSV = path.join(FIXTURE_DIR, 'glossary-legacy.csv');

describe('parseGlossaryFile — new format (banner + No./en-US/zh-CN header)', () => {
  it('detects the header row and skips the banner', async () => {
    const result = await parseGlossaryFile(XLSX, { sheetIndex: 0 });

    expect(result.sheets).toEqual(['Terms', 'Legacy3Col', 'NoHeader']);
    expect(result.columns).toEqual({
      seq: 0,
      en: 1,
      zhCN: 2,
      zhTW: undefined,
      detectedBy: 'header',
      headerRow: 2,
    });
    expect(result.warnings).toEqual([]);
    // 17 data rows, one is fully blank → 16 parsed rows.
    expect(result.rows).toHaveLength(16);
    expect(result.rows[0]).toMatchObject({
      row: 3,
      seq: 1,
      en: 'Duty cycle',
      zhCN: '占空比',
    });
  });

  it('cleans zero-width and NBSP characters in cells', async () => {
    const result = await parseGlossaryFile(XLSX, { sheetIndex: 0 });
    expect(result.rows.find((r) => r.seq === 14)?.en).toBe('ZeroWidth timer');
    expect(result.rows.find((r) => r.seq === 15)?.zhCN).toBe('外设 时钟');
  });

  it('reads rich-text cells as plain text', async () => {
    const result = await parseGlossaryFile(XLSX, { sheetIndex: 0 });
    expect(result.rows.find((r) => r.seq === 4)?.en).toBe('Duty   Cycle');
    expect(result.rows.find((r) => r.seq === 11)?.en).toBe('Firmware update');
  });

  it('keeps rows whose zh-CN cell is empty', async () => {
    const result = await parseGlossaryFile(XLSX, { sheetIndex: 0 });
    const row = result.rows.find((r) => r.seq === 13);
    expect(row).toMatchObject({ en: 'ESP32 PWM controller', zhCN: '' });
  });
});

describe('parseGlossaryFile — legacy three-column sheet', () => {
  it('detects English/简体中文/繁體中文', async () => {
    const result = await parseGlossaryFile(XLSX, { sheetIndex: 1 });
    expect(result.columns).toEqual({
      seq: undefined,
      en: 0,
      zhCN: 1,
      zhTW: 2,
      detectedBy: 'header',
      headerRow: 1,
    });
    expect(result.rows).toHaveLength(5);
    // Missing zh-TW must not drop the row any more.
    expect(result.rows.find((r) => r.en === 'Table')).toMatchObject({ zhTW: '' });
  });
});

describe('parseGlossaryFile — header-less sheet', () => {
  it('falls back to positional seq/en/zhCN detection', async () => {
    const result = await parseGlossaryFile(XLSX, { sheetIndex: 2 });
    expect(result.columns).toEqual({
      seq: 0,
      en: 1,
      zhCN: 2,
      zhTW: undefined,
      detectedBy: 'position',
    });
    expect(result.rows.map((r) => r.en)).toEqual([
      'Bootloader',
      'Watchdog timer',
      'Interrupt',
    ]);
    expect(result.warnings.join('\n')).toContain('No header row was found');
  });
});

describe('parseGlossaryFile — CSV', () => {
  it('handles BOM, CRLF and quoted commas', async () => {
    const result = await parseGlossaryFile(CSV);
    expect(result.columns.detectedBy).toBe('header');
    expect(result.rows).toHaveLength(4);
    expect(result.rows[2]).toMatchObject({
      seq: 3,
      en: 'Firmware update',
      zhCN: '固件升级, 固件更新',
    });
  });

  it('parses the legacy CSV header', async () => {
    const result = await parseGlossaryFile(LEGACY_CSV);
    expect(result.columns).toMatchObject({ en: 0, zhCN: 1, zhTW: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].en).toBe('Technical documentation');
  });
});

describe('parseGlossaryFile — validation', () => {
  it('rejects legacy .xls files with a re-save hint', async () => {
    await expect(parseGlossaryFile(path.join(FIXTURE_DIR, 'old.xls'))).rejects.toThrow(
      /Re-save the file as \.xlsx/
    );
  });

  it('rejects unsupported extensions', async () => {
    await expect(parseGlossaryFile(path.join(FIXTURE_DIR, 'glossary.txt'))).rejects.toThrow(
      /Unsupported file format/
    );
  });

  it('accepts a manual column override', async () => {
    const result = await parseGlossaryFile(XLSX, {
      sheetIndex: 0,
      columnOverride: { en: 1, zhCN: 2 },
    });
    expect(result.columns.detectedBy).toBe('manual');
    expect(result.columns.headerRow).toBe(2);
    expect(result.rows).toHaveLength(16);
  });
});
