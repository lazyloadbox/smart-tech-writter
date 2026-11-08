import { describe, expect, it } from 'vitest';
import {
  classifyEntryKind,
  cleanCellText,
  countWords,
  normalizeEn,
  normalizeZh,
} from '../../src/main/modules/glossary/normalize';

describe('cleanCellText', () => {
  it('strips zero-width characters and converts non-breaking spaces', () => {
    expect(cleanCellText('Zero\u200BWidth\uFEFF timer')).toBe('ZeroWidth timer');
    expect(cleanCellText('外设\u00A0时钟')).toBe('外设 时钟');
  });

  it('handles null / undefined', () => {
    expect(cleanCellText(null)).toBe('');
    expect(cleanCellText(undefined)).toBe('');
  });
});

describe('normalizeEn', () => {
  it('collapses case, whitespace and trailing punctuation', () => {
    expect(normalizeEn('Duty cycle')).toBe('duty cycle');
    expect(normalizeEn('Duty   Cycle')).toBe('duty cycle');
    expect(normalizeEn('Duty cycle.')).toBe('duty cycle');
    expect(normalizeEn('  DUTY   CYCLE ;  ')).toBe('duty cycle');
  });

  it('normalizes curly quotes', () => {
    expect(normalizeEn('“Reset”')).toBe('"reset"');
    expect(normalizeEn("‘Reset’")).toBe("'reset'");
  });

  it('normalizes full-width letters via NFKC', () => {
    expect(normalizeEn('ＬＥＤＣ')).toBe('ledc');
  });

  it('keeps hyphens (only the L2 alias layer merges on-chip / on chip)', () => {
    expect(normalizeEn('dead-time')).toBe('dead-time');
  });

  it('returns an empty key for blank input', () => {
    expect(normalizeEn('   ')).toBe('');
    expect(normalizeEn(null)).toBe('');
  });
});

describe('normalizeZh', () => {
  it('removes every whitespace and normalizes width', () => {
    expect(normalizeZh('占 空 比')).toBe('占空比');
    expect(normalizeZh('外设\u00A0时钟')).toBe('外设时钟');
    expect(normalizeZh('外设 时钟')).toBe('外设时钟');
  });
});

describe('classifyEntryKind', () => {
  it('classifies short entries as terms', () => {
    expect(classifyEntryKind('Duty cycle')).toBe('term');
    expect(classifyEntryKind('PWM (Pulse Width Modulation)')).toBe('term');
    expect(classifyEntryKind('ESP32 PWM controller')).toBe('term');
  });

  it('classifies long entries or sentences as phrases', () => {
    expect(
      classifyEntryKind('Do not disconnect the power supply during a firmware update.')
    ).toBe('phrase');
    expect(
      classifyEntryKind('one two three four five six seven')
    ).toBe('phrase');
  });

  it('treats an empty value as a phrase', () => {
    expect(classifyEntryKind('')).toBe('phrase');
  });
});

describe('countWords', () => {
  it('counts whitespace separated words', () => {
    expect(countWords('Duty cycle')).toBe(2);
    expect(countWords('  ')).toBe(0);
  });
});
