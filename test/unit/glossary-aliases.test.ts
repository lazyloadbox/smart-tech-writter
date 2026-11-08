import { describe, expect, it } from 'vitest';
import {
  computeSpecificity,
  expandAliases,
  expandEnAliases,
  expandZhAliases,
  isCommonWord,
} from '../../src/main/modules/glossary/aliases';

describe('expandEnAliases', () => {
  it('splits an abbreviation out of parentheses', () => {
    const aliases = expandEnAliases('Pulse Width Modulation (PWM)');
    expect(aliases.map((a) => a.alias)).toEqual(
      expect.arrayContaining(['Pulse Width Modulation', 'PWM'])
    );
    expect(aliases.find((a) => a.alias === 'PWM')?.kind).toBe('abbr');
    expect(aliases.find((a) => a.alias === 'Pulse Width Modulation')?.kind).toBe('primary');
  });

  it('splits alternative spellings', () => {
    const aliases = expandEnAliases('Reset / Restore');
    expect(aliases.map((a) => a.alias)).toEqual(['Reset', 'Restore']);
  });

  it('expands hyphenated terms into space and joined variants', () => {
    const aliases = expandEnAliases('on-chip');
    expect(aliases.map((a) => a.alias)).toEqual(['on-chip', 'on chip', 'onchip']);
    expect(aliases.map((a) => a.kind)).toEqual(['primary', 'variant', 'variant']);
  });

  it('deduplicates by normalized key', () => {
    const aliases = expandEnAliases('Duty cycle / duty cycle');
    expect(aliases).toHaveLength(1);
  });

  it('keeps a single alias unchanged', () => {
    const aliases = expandEnAliases('Dead time');
    expect(aliases).toEqual([
      { alias: 'Dead time', aliasKey: 'dead time', kind: 'primary' },
    ]);
  });
});

describe('expandZhAliases', () => {
  it('splits full-width bracket synonyms', () => {
    const aliases = expandZhAliases('占空比（占空系数）');
    expect(aliases.map((a) => a.alias)).toEqual(['占空系数', '占空比']);
  });

  it('splits on Chinese separators', () => {
    const aliases = expandZhAliases('分频器、除频器');
    expect(aliases.map((a) => a.alias)).toEqual(['分频器', '除频器']);
  });

  it('keeps simple Chinese terms', () => {
    expect(expandZhAliases('占空比').map((a) => a.aliasKey)).toEqual(['占空比']);
  });
});

describe('expandAliases', () => {
  it('expands both sides of an entry', () => {
    const bundle = expandAliases({
      en: 'Pulse Width Modulation (PWM)',
      zhCN: '脉宽调制',
      zhTW: '脈寬調變',
    });
    expect(bundle.en.map((a) => a.alias)).toEqual(
      expect.arrayContaining(['Pulse Width Modulation', 'PWM'])
    );
    expect(bundle.zh.map((a) => a.alias)).toEqual(
      expect.arrayContaining(['脉宽调制', '脈寬調變'])
    );
  });
});

describe('specificity', () => {
  it('flags very common single words as low specificity', () => {
    expect(isCommonWord('Power')).toBe(true);
    expect(isCommonWord('registers')).toBe(false);
    expect(computeSpecificity({ en: 'Power' })).toBe(0.35);
  });

  it('scores normal terms higher', () => {
    expect(computeSpecificity({ en: 'Duty cycle' })).toBe(0.85);
    expect(computeSpecificity({ en: 'PWM' })).toBe(0.95);
    expect(computeSpecificity({ en: 'ESP32' })).toBe(0.95);
  });

  it('scores sentences as phrases', () => {
    expect(
      computeSpecificity({
        en: 'Do not disconnect the power supply during a firmware update.',
      })
    ).toBe(0.9);
  });
});
