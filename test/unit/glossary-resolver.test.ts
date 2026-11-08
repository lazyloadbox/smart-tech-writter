import { describe, expect, it } from 'vitest';
import { fuseGlossaryMatches, resolveGlossary, priority } from '../../src/main/modules/glossary/resolver';
import { applyBudget, estimateTokens, glossaryBudgetFor } from '../../src/main/modules/glossary/budget';
import { buildGlossaryPromptBlock } from '../../src/main/modules/glossary/prompt-blocks';
import { GlossaryIndex, type GlossaryIndexRow } from '../../src/main/modules/glossary/index/glossary-index';
import {
  mergeGlossarySettings,
  type GlossaryEntryView,
  type GlossaryHit,
} from '../../src/shared/types/glossary.types';

const settings = mergeGlossarySettings(null);

const entries: Record<string, GlossaryEntryView> = {
  duty: { id: 'duty', en: 'Duty cycle', zhCN: '占空比', zhTW: '', kind: 'term', specificity: 0.85 },
  power: { id: 'power', en: 'Power', zhCN: '电源', zhTW: '電源', kind: 'term', specificity: 0.35 },
  phrase: {
    id: 'phrase',
    en: 'Do not disconnect the power supply during a firmware update.',
    zhCN: '固件升级过程中请勿断开电源。',
    zhTW: '',
    kind: 'phrase',
    specificity: 0.9,
  },
};

const lookup = (id: string): GlossaryEntryView | undefined => entries[id];

describe('estimateTokens', () => {
  it('estimates Latin text roughly by characters / 4', () => {
    const tokens = estimateTokens('hello world example');
    expect(tokens).toBeGreaterThan(2);
    expect(tokens).toBeLessThan(10);
  });

  it('counts CJK as one token per character', () => {
    expect(estimateTokens('占空比')).toBeGreaterThanOrEqual(3);
    expect(estimateTokens('占空比')).toBeGreaterThan(estimateTokens('abc'));
  });
});

describe('glossaryBudgetFor', () => {
  it('uses the per-scenario budget', () => {
    expect(glossaryBudgetFor(settings, 'writing')).toBe(settings.budget.writer);
    expect(glossaryBudgetFor(settings, 'translation')).toBe(settings.budget.translateChunk);
    expect(glossaryBudgetFor(settings, 'review')).toBe(settings.budget.reviewChunk);
  });

  it('caps the budget at 15% of the model context', () => {
    const small = mergeGlossarySettings({ modelContextTokens: 1000, budget: { writer: 6000, translateChunk: 4000, reviewChunk: 3000 } });
    expect(glossaryBudgetFor(small, 'writing')).toBe(150);
  });
});

describe('applyBudget', () => {
  it('keeps lines until the budget is exhausted', () => {
    const block = applyBudget(
      '## Header',
      [{ text: 'one', id: 'a' }, { text: 'two', id: 'b' }, { text: 'three', id: 'c' }],
      2
    );
    // Heading alone may exceed a 2-token budget.
    expect(block.text === '' || block.includedIds.length < 3).toBe(true);
  });

  it('includes every line when the budget is generous', () => {
    const block = applyBudget(
      '## Header',
      [{ text: 'Duty cycle\t占空比', id: 'a' }, { text: 'PWM\t脉宽调制', id: 'b' }],
      1000
    );
    expect(block.includedIds).toEqual(['a', 'b']);
    expect(block.truncated).toBe(0);
    expect(block.text).toContain('Duty cycle');
  });
});

describe('fuseGlossaryMatches', () => {
  it('promotes exact matches to Tier A', () => {
    const { hits } = fuseGlossaryMatches(
      [
        { entryId: 'duty', layer: 'exact', similarity: 1, surface: 'Duty cycle', canonical: 'Duty cycle', start: 0, end: 10 },
        { entryId: 'duty', layer: 'exact', similarity: 1, surface: 'Duty cycle', canonical: 'Duty cycle', start: 20, end: 30 },
      ],
      lookup,
      settings
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ entryId: 'duty', tier: 'A', hits: 2 });
  });

  it('classifies variant-only matches at score 0.95 (Tier A)', () => {
    const { hits } = fuseGlossaryMatches(
      [{ entryId: 'duty', layer: 'variant', similarity: 1, surface: 'duty cycle', canonical: 'Duty cycle', start: 0, end: 10 }],
      lookup,
      settings
    );
    expect(hits[0]).toMatchObject({ tier: 'A', score: 0.95 });
  });

  it('caps low specificity entries at Tier B', () => {
    const { hits } = fuseGlossaryMatches(
      [{ entryId: 'power', layer: 'exact', similarity: 1, surface: 'Power', canonical: 'Power', start: 0, end: 5 }],
      lookup,
      settings
    );
    expect(hits[0]).toMatchObject({ tier: 'B', score: 0.7 });
  });

  it('keeps fuzzy matches at Tier B', () => {
    const { hits } = fuseGlossaryMatches(
      [{ entryId: 'phrase', layer: 'fuzzy', similarity: 0.96, surface: 'sentence', canonical: 'sentence', start: 0, end: 8 }],
      lookup,
      settings
    );
    expect(hits[0].tier).toBe('B');
  });

  it('orders by priority (hits × specificity)', () => {
    const { hits } = fuseGlossaryMatches(
      [
        { entryId: 'duty', layer: 'exact', similarity: 1, surface: 'Duty cycle', canonical: 'Duty cycle', start: 0, end: 10 },
        { entryId: 'phrase', layer: 'exact', similarity: 1, surface: 'sentence', canonical: 'sentence', start: 20, end: 28 },
        { entryId: 'phrase', layer: 'exact', similarity: 1, surface: 'sentence', canonical: 'sentence', start: 30, end: 38 },
      ],
      lookup,
      settings
    );
    expect(hits[0].entryId).toBe('phrase');
    expect(priority(hits[0], lookup)).toBeGreaterThan(priority(hits[1], lookup));
  });
});

describe('resolveGlossary', () => {
  it('resolves text through the index', () => {
    const rows: GlossaryIndexRow[] = [
      { id: 'duty', en: 'Duty cycle', zhCN: '占空比', zhTW: '', kind: 'term' },
    ];
    const index = new GlossaryIndex(rows);
    const result = resolveGlossary(index, 'Configure the Duty cycle now.', {
      scenario: 'writing',
      settings,
      side: 'both',
      enableFuzzy: false,
    });
    expect(result.hits[0]).toMatchObject({ entryId: 'duty', tier: 'A' });
    expect(result.layers.exact).toBe(1);
  });
});

describe('buildGlossaryPromptBlock', () => {
  const hits: GlossaryHit[] = [
    { entryId: 'duty', tier: 'A', score: 1, layers: ['exact'], hits: 1, samples: [] },
  ];

  it('renders a translation block in the requested direction', () => {
    const block = buildGlossaryPromptBlock({
      hits,
      lookup,
      scenario: 'translation',
      targetLang: 'zh-CN',
      budgetTokens: 4000,
    });
    expect(block.text).toContain('Translation Glossary');
    expect(block.text).toContain('Duty cycle\t占空比');
  });

  it('falls back to zh-CN with a conversion note for zh-TW', () => {
    const block = buildGlossaryPromptBlock({
      hits,
      lookup,
      scenario: 'translation',
      targetLang: 'zh-TW',
      budgetTokens: 4000,
    });
    expect(block.text).toContain('(zh-CN reference)');
  });

  it('renders an en-US block for writing', () => {
    const block = buildGlossaryPromptBlock({
      hits,
      lookup,
      scenario: 'writing',
      budgetTokens: 4000,
    });
    expect(block.text).toContain('Approved Terminology (en-US)');
    expect(block.text).toContain('MUST use');
  });

  it('skips entries without a usable target', () => {
    const noTarget: GlossaryEntryView = {
      id: 'notarget',
      en: 'Only English',
      zhCN: '',
      zhTW: '',
      kind: 'term',
      specificity: 0.8,
    };
    const block = buildGlossaryPromptBlock({
      hits: [{ entryId: 'notarget', tier: 'A', score: 1, layers: ['exact'], hits: 1, samples: [] }],
      lookup: (id) => (id === 'notarget' ? noTarget : undefined),
      scenario: 'translation',
      targetLang: 'zh-CN',
      budgetTokens: 4000,
    });
    expect(block.text).toBe('');
  });
});
