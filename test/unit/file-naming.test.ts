import { describe, expect, it } from 'vitest';
import {
  buildSectionBaseName,
  buildSectionFileName,
  computeIndexWidth,
  formatIndex,
  MAX_SAFE_TITLE_LENGTH,
  stripLeadingSectionNumber,
  toSafeFileName,
} from '../../src/main/modules/document-builder/file-naming';

describe('toSafeFileName', () => {
  it('replaces Windows-illegal characters with dashes', () => {
    expect(toSafeFileName('A/B:C*D?E"F<G>H|I\\J')).toBe('A-B-C-D-E-F-G-H-I-J');
  });

  it('collapses whitespace and trims edges and trailing dots', () => {
    expect(toSafeFileName('  Product   Overview.  ')).toBe('Product Overview');
  });

  it('keeps Chinese characters unchanged', () => {
    expect(toSafeFileName('执行摘要')).toBe('执行摘要');
    expect(toSafeFileName('技术规格 / 测试')).toBe('技术规格 - 测试');
  });

  it('prefixes Windows reserved device names', () => {
    expect(toSafeFileName('CON')).toBe('_CON');
    expect(toSafeFileName('con')).toBe('_con');
    expect(toSafeFileName('PRN')).toBe('_PRN');
    expect(toSafeFileName('LPT9')).toBe('_LPT9');
    expect(toSafeFileName('COM1')).toBe('_COM1');
    // COM10 is not a reserved name.
    expect(toSafeFileName('COM10')).toBe('COM10');
  });

  it('falls back to "Section" for empty input', () => {
    expect(toSafeFileName('')).toBe('Section');
    expect(toSafeFileName('   ')).toBe('Section');
    expect(toSafeFileName('...')).toBe('Section');
  });

  it('truncates long titles to 80 code points without breaking surrogate pairs', () => {
    const longAscii = 'A'.repeat(120);
    expect(Array.from(toSafeFileName(longAscii))).toHaveLength(MAX_SAFE_TITLE_LENGTH);

    const longCjk = '中文标题'.repeat(40); // 160 CJK code points
    expect(Array.from(toSafeFileName(longCjk))).toHaveLength(MAX_SAFE_TITLE_LENGTH);

    const withEmoji = `${'A'.repeat(79)}😀😀`;
    const safe = toSafeFileName(withEmoji);
    expect(Array.from(safe)).toHaveLength(MAX_SAFE_TITLE_LENGTH);
    expect(safe.endsWith('\uD83D')).toBe(false); // no lone surrogate
  });
});

describe('sequence number formatting', () => {
  it('computes width from the number of sections', () => {
    expect(computeIndexWidth(9)).toBe(2);
    expect(computeIndexWidth(10)).toBe(2);
    expect(computeIndexWidth(100)).toBe(3);
    expect(computeIndexWidth(1)).toBe(2);
    expect(computeIndexWidth(0)).toBe(2);
  });

  it('zero-pads a sequence number', () => {
    expect(formatIndex(1)).toBe('01');
    expect(formatIndex(9)).toBe('09');
    expect(formatIndex(10)).toBe('10');
    expect(formatIndex(1, 3)).toBe('001');
    expect(formatIndex(42, 3)).toBe('042');
  });
});

describe('buildSectionFileName', () => {
  it('combines the sequence number, safe title and extension', () => {
    expect(buildSectionFileName(1, 6, 'Executive Summary')).toBe('01_Executive Summary.dita');
    expect(buildSectionFileName(2, 6, 'Product: Feature Overview')).toBe(
      '02_Product- Feature Overview.dita',
    );
    expect(buildSectionFileName(5, 100, 'Technical Specifications')).toBe(
      '005_Technical Specifications.dita',
    );
  });

  it('uses a custom extension when requested', () => {
    expect(buildSectionFileName(1, 2, 'Overview', 'docx')).toBe('01_Overview.docx');
  });

  it('keeps the exported number and the title number aligned', () => {
    expect(buildSectionFileName(1, 5, '2. Product-Feature Overview')).toBe(
      '01_Product-Feature Overview.dita',
    );
    expect(buildSectionBaseName(4, 5, '5) Requirements and Dependencies')).toBe(
      '04_Requirements and Dependencies',
    );
  });
});

describe('stripLeadingSectionNumber', () => {
  it('strips the usual numbered-heading prefixes', () => {
    expect(stripLeadingSectionNumber('1. Executive Summary')).toBe('Executive Summary');
    expect(stripLeadingSectionNumber('3、技术要求')).toBe('技术要求');
    expect(stripLeadingSectionNumber('4) Key Features')).toBe('Key Features');
    expect(stripLeadingSectionNumber('6 - Implementation Notes')).toBe('Implementation Notes');
  });

  it('keeps numbers that belong to the title itself', () => {
    expect(stripLeadingSectionNumber('5 kHz PWM Frequency')).toBe('5 kHz PWM Frequency');
    expect(stripLeadingSectionNumber('2:1 Multiplexer')).toBe('2:1 Multiplexer');
    expect(stripLeadingSectionNumber('ESP32 Overview')).toBe('ESP32 Overview');
  });

  it('never returns an empty title', () => {
    expect(stripLeadingSectionNumber('1. ')).toBe('1.');
    expect(stripLeadingSectionNumber('')).toBe('');
  });
});
