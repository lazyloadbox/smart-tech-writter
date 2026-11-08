import { describe, expect, it } from 'vitest';
import { fuseGlossaryMatches } from '../../src/main/modules/glossary/resolver';
import { mergeCandidates } from '../../src/main/modules/agents/term-extractor.agent';
import { sanitizeVerdicts } from '../../src/main/modules/agents/glossary-adjudicator.agent';
import { mergeGlossarySettings, type GlossaryEntryView } from '../../src/shared/types/glossary.types';
import type { GlossaryAdjudicationCandidate } from '../../src/shared/types/glossary.types';

const settings = mergeGlossarySettings(null);

const entries: Record<string, GlossaryEntryView> = {
  duty: { id: 'duty', en: 'Duty cycle', zhCN: '占空比', zhTW: '', kind: 'term', specificity: 0.85 },
  pwm: { id: 'pwm', en: 'PWM', zhCN: '脉宽调制', zhTW: '', kind: 'term', specificity: 0.95 },
};
const lookup = (id: string): GlossaryEntryView | undefined => entries[id];

describe('mergeCandidates (L5a)', () => {
  it('deduplicates surface + English guess and keeps the first context', () => {
    const merged = mergeCandidates([
      { surface: '占空比', lang: 'zh', englishGuess: 'duty cycle' },
      { surface: '占空比', lang: 'zh', englishGuess: 'Duty Cycle', context: '设置占空比' },
      { surface: '脉宽', lang: 'zh', englishGuess: 'pwm' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].context).toBe('设置占空比');
  });

  it('drops entries without a surface', () => {
    expect(mergeCandidates([{ surface: '   ', englishGuess: 'x' }])).toEqual([]);
  });
});

describe('sanitizeVerdicts (L5b)', () => {
  const candidates: GlossaryAdjudicationCandidate[] = [
    { candidateId: 'c0', surface: '占空比', options: [{ entryId: 'duty', en: 'Duty cycle', zhCN: '占空比', score: 0.85 }] },
  ];

  it('keeps verdicts that reference an offered entry', () => {
    const verdicts = sanitizeVerdicts(candidates, [
      { candidateId: 'c0', entryId: 'duty', confidence: 0.9, reason: 'same concept' },
    ]);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].entryId).toBe('duty');
  });

  it('nulls entry ids that were not offered and drops unknown candidates', () => {
    const verdicts = sanitizeVerdicts(candidates, [
      { candidateId: 'c0', entryId: 'pwm', confidence: 0.9 },
      { candidateId: 'c9', entryId: 'duty', confidence: 0.9 },
    ]);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].entryId).toBeNull();
  });
});

describe('fusing L4/L5 evidence', () => {
  it('a semantic hit alone is Tier B ("use if the meaning matches")', () => {
    const { hits } = fuseGlossaryMatches([], lookup, settings, [
      { entryId: 'duty', layer: 'semantic', similarity: 1 },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].tier).toBe('B');
    expect(hits[0].layers).toEqual(['semantic']);
  });

  it('an AI-confirmed candidate is promoted to Tier A', () => {
    const { hits } = fuseGlossaryMatches([], lookup, settings, [
      { entryId: 'duty', layer: 'ai', similarity: 1 },
    ]);
    expect(hits[0].tier).toBe('A');
  });

  it('combines literal and semantic evidence into one hit', () => {
    const { hits } = fuseGlossaryMatches(
      [
        {
          entryId: 'duty',
          layer: 'exact',
          similarity: 1,
          surface: 'Duty cycle',
          canonical: 'Duty cycle',
          start: 0,
          end: 10,
        },
      ],
      lookup,
      settings,
      [{ entryId: 'duty', layer: 'semantic', similarity: 1 }]
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].tier).toBe('A');
    expect(new Set(hits[0].layers)).toEqual(new Set(['exact', 'semantic']));
    expect(hits[0].hits).toBe(2);
  });
});
