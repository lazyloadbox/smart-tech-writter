import { describe, expect, it } from 'vitest';
import {
  GlossaryIndex,
  preparePlainText,
  splitSentences,
  type GlossaryIndexRow,
} from '../../src/main/modules/glossary/index/glossary-index';

function buildIndex(rows: GlossaryIndexRow[]): GlossaryIndex {
  return new GlossaryIndex(rows);
}

describe('preparePlainText', () => {
  it('removes markup but keeps offsets stable', () => {
    const xml = '<p>Duty cycle</p>';
    const plain = preparePlainText(xml);
    expect(plain).toHaveLength(xml.length);
    expect(plain).toContain('Duty cycle');
    expect(plain).not.toContain('<p>');
  });

  it('blanks verbatim elements so code is never matched', () => {
    const xml = '<p>占空比</p><codeblock>占空比</codeblock>';
    const plain = preparePlainText(xml);
    expect(plain.split('占空比')).toHaveLength(2); // only one occurrence remains
  });

  it('skips comments', () => {
    const xml = '<!-- 占空比 --><p>占空比</p>';
    const plain = preparePlainText(xml);
    expect(plain.split('占空比')).toHaveLength(2);
  });
});

describe('splitSentences', () => {
  it('splits on sentence punctuation and skips short fragments', () => {
    const sentences = splitSentences('First sentence here. Second sentence, longer. Ok.');
    expect(sentences.map((s) => s.text)).toEqual([
      'First sentence here',
      'Second sentence, longer',
    ]);
  });
});

describe('GlossaryIndex — English L1/L2', () => {
  const index = buildIndex([
    { id: 'duty', en: 'Duty cycle', zhCN: '占空比', zhTW: '佔空比', kind: 'term' },
    { id: 'pwm', en: 'PWM', zhCN: '脉宽调制', zhTW: '脈寬調變', kind: 'term' },
    { id: 'power', en: 'Power', zhCN: '电源', zhTW: '電源', kind: 'term' },
  ]);

  it('matches exact text', () => {
    const [hit] = index.match('The Duty cycle is fixed.', { side: 'en', enableFuzzy: false });
    expect(hit).toMatchObject({ entryId: 'duty', layer: 'exact', surface: 'Duty cycle' });
  });

  it('matches case and plural variants (L2)', () => {
    const matches = index.match('The duty cycles are fixed.', { side: 'en', enableFuzzy: false });
    expect(matches[0]).toMatchObject({ entryId: 'duty', layer: 'variant' });
  });

  it('respects word boundaries', () => {
    const matches = index.match('PWMA is different', { side: 'en', enableFuzzy: false });
    expect(matches).toHaveLength(0);
  });

  it('requires case-exact matches for low specificity entries', () => {
    expect(index.match('lowercase power here', { side: 'en', enableFuzzy: false })).toHaveLength(0);
    expect(index.match('Power supply', { side: 'en', enableFuzzy: false })[0]?.entryId).toBe('power');
  });

  it('can disable variant matching', () => {
    const matches = index.match('duty cycle', {
      side: 'en',
      enableVariant: false,
      enableFuzzy: false,
    });
    expect(matches).toHaveLength(0);
  });
});

describe('GlossaryIndex — Chinese L1', () => {
  it('matches both a term and a longer term that contains it', () => {
    const index = buildIndex([
      { id: 'short', en: 'Duty cycle', zhCN: '占空比', zhTW: '', kind: 'term' },
      { id: 'long', en: 'Duty cycle register', zhCN: '占空比寄存器', zhTW: '', kind: 'term' },
    ]);
    const matches = index.match('配置占空比寄存器后继续', { side: 'zh', enableFuzzy: false });
    const ids = [...new Set(matches.map((m) => m.entryId))].sort();
    expect(ids).toEqual(['long', 'short']);
  });

  it('matches aliases inside brackets', () => {
    const index = buildIndex([
      { id: 'duty', en: 'Duty cycle', zhCN: '占空比（占空系数）', zhTW: '', kind: 'term' },
    ]);
    const matches = index.match('这里使用占空系数', { side: 'zh', enableFuzzy: false });
    expect(matches[0]).toMatchObject({ entryId: 'duty', layer: 'exact' });
  });
});

describe('GlossaryIndex — L3 fuzzy phrases', () => {
  it('matches a near-identical sentence', () => {
    const index = buildIndex([
      {
        id: 'warning',
        en: 'Do not disconnect the power supply during a firmware update.',
        zhCN: '固件升级过程中请勿断开电源。',
        zhTW: '',
        kind: 'phrase',
      },
    ]);
    const matches = index.match(
      'Do not disconnect the power supply during a firmware upgrade.',
      { side: 'en', enableFuzzy: true, fuzzyThreshold: 0.75 }
    );
    const fuzzy = matches.find((m) => m.layer === 'fuzzy');
    expect(fuzzy).toBeDefined();
    expect(fuzzy?.similarity).toBeGreaterThanOrEqual(0.75);
  });

  it('does not fuzzy-match unrelated sentences', () => {
    const index = buildIndex([
      {
        id: 'warning',
        en: 'Do not disconnect the power supply during a firmware update.',
        zhCN: '固件升级过程中请勿断开电源。',
        zhTW: '',
        kind: 'phrase',
      },
    ]);
    const matches = index.match('This paragraph talks about clock dividers and timers.', {
      side: 'en',
      enableFuzzy: true,
      fuzzyThreshold: 0.75,
    });
    expect(matches.filter((m) => m.layer === 'fuzzy')).toHaveLength(0);
  });
});
