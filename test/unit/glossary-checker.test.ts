import { describe, expect, it } from 'vitest';
import {
  checkDraftTerms,
  checkPhraseReuse,
  checkTranslationTerms,
} from '../../src/main/modules/glossary/checker';
import type { GlossaryEntryView } from '../../src/shared/types/glossary.types';

const entries: Record<string, GlossaryEntryView> = {
  e1: { id: 'e1', en: 'Duty cycle', zhCN: '占空比', zhTW: '', kind: 'term', specificity: 0.9 },
  e2: { id: 'e2', en: 'Reset the device.', zhCN: '复位设备。', zhTW: '', kind: 'phrase', specificity: 0.9 },
  e3: { id: 'e3', en: 'Power', zhCN: '电源', zhTW: '', kind: 'term', specificity: 0.35 },
};
const lookup = (id: string) => entries[id];

const hit = (entryId: string, tier: 'A' | 'B' = 'A') => ({
  entryId,
  tier,
  score: 1,
  layers: ['exact' as const],
  hits: 1,
  samples: [] as { surface: string; context: string }[],
});

describe('glossary checker (P3)', () => {
  it('R1 reports a source concept whose approved English is missing', () => {
    const issues = checkDraftTerms({
      draftText: 'The controller adjusts the output.',
      sourceText: '控制器调整占空比。',
      hits: [hit('e1')],
      lookup,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('R1');
    expect(issues[0].expected).toBe('Duty cycle');
  });

  it('R2 produces an acceptable variant suggestion', () => {
    const issues = checkDraftTerms({
      draftText: 'Set the duty-cycle to 50%.',
      sourceText: '设置占空比。',
      hits: [hit('e1')],
      lookup,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('R2');
    expect(issues[0].originalText).toBe('duty-cycle');
    expect(issues[0].suggestedText).toBe('Duty cycle');
  });

  it('R2 does not fire for the approved wording', () => {
    const issues = checkDraftTerms({
      draftText: 'Set the Duty cycle to 50%.',
      sourceText: '设置占空比。',
      hits: [hit('e1')],
      lookup,
    });
    expect(issues).toHaveLength(0);
  });

  it('R1 ignores low-specificity entries', () => {
    const issues = checkDraftTerms({
      draftText: 'The input is stable.',
      sourceText: '电源稳定。',
      hits: [hit('e3')],
      lookup,
    });
    expect(issues).toHaveLength(0);
  });

  it('R3 reports the missing target translation', () => {
    const issues = checkTranslationTerms({
      sourceText: 'Set the Duty cycle.',
      targetText: '设置输出。',
      hits: [hit('e1')],
      lookup,
      targetLang: 'zh-CN',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('R3');
    expect(issues[0].expected).toBe('占空比');
  });

  it('R4 reports a sentence that was not reused', () => {
    const issues = checkPhraseReuse({
      sourceText: 'Reset the device.',
      targetText: '重启设备。',
      hits: [hit('e2')],
      lookup,
      targetLang: 'zh-CN',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('R4');
  });

  it('respects Tier A-only reporting', () => {
    const issues = checkDraftTerms({
      draftText: 'nothing relevant',
      sourceText: '占空比',
      hits: [hit('e1', 'B')],
      lookup,
    });
    expect(issues).toHaveLength(0);
  });
});
