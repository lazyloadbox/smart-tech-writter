import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseForbiddenCell } from '../../src/main/modules/glossary/file-parser';
import { buildImportPlan, type ExistingGlossaryEntry } from '../../src/main/modules/glossary/deduper';
import { checkForbiddenTerms } from '../../src/main/modules/glossary/checker';
import { buildUsageReport } from '../../src/main/modules/glossary/usage-report';
import { parseDoNotUse, serializeDoNotUse } from '../../src/main/modules/glossary/normalize';
import {
  loadVectorSnapshot,
  saveVectorSnapshot,
  snapshotFingerprint,
} from '../../src/main/modules/glossary/index/vector-snapshot';
import { VectorIndex } from '../../src/main/modules/glossary/index/vector-index';
import type { GlossaryEntryView } from '../../src/shared/types/glossary.types';
import type { ParsedGlossaryRow } from '../../src/shared/types/mapping.types';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stw-p4-'));
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('P4-6 "Do not use" input parsing', () => {
  it('splits a cell on newlines, semicolons, pipes and slashes', () => {
    expect(parseForbiddenCell('Duty Cycle\nDuty-Cycle;PWM ratio |period')).toEqual([
      'Duty Cycle',
      'Duty-Cycle',
      'PWM ratio',
      'period',
    ]);
  });

  it('de-duplicates case-insensitively and drops empty parts', () => {
    expect(parseForbiddenCell('Foo ; foo ;; bar 、')).toEqual(['Foo', 'bar']);
    expect(parseForbiddenCell('   ')).toEqual([]);
  });

  it('round-trips the stored JSON list and tolerates legacy text', () => {
    expect(serializeDoNotUse(['A', 'B'])).toBe('["A","B"]');
    expect(serializeDoNotUse([])).toBe('');
    expect(serializeDoNotUse(undefined)).toBe('');
    expect(parseDoNotUse('["A","B"]')).toEqual(['A', 'B']);
    expect(parseDoNotUse('A; B')).toEqual(['A', 'B']);
    expect(parseDoNotUse(null)).toEqual([]);
  });
});

describe('P4-6 import planner carries forbidden wordings', () => {
  const rows: ParsedGlossaryRow[] = [
    { row: 2, en: 'Duty cycle', zhCN: '占空比', zhTW: '', doNotUse: ['Duty cycle ratio'] },
  ];
  const existing: ExistingGlossaryEntry = {
    id: 'e1',
    enKey: 'duty cycle',
    en: 'Duty cycle',
    zhCN: '占空比',
    zhTW: '',
    origin: 'import',
  };

  it('inserts a new row with its forbidden list', () => {
    const { operations } = buildImportPlan({
      rows,
      existing: [],
      existingTotal: 0,
      mode: 'append',
      strategy: 'overwrite',
      keepDefaults: false,
    });
    expect(operations.inserts[0]?.doNotUse).toEqual(['Duty cycle ratio']);
  });

  it('treats a new forbidden list as a change and keeps it on overwrite', () => {
    const { operations, plan } = buildImportPlan({
      rows,
      existing: [existing],
      existingTotal: 1,
      mode: 'append',
      strategy: 'overwrite',
      keepDefaults: false,
    });
    expect(plan.toUpdate).toBe(1);
    expect(operations.updates[0]?.doNotUse).toEqual(['Duty cycle ratio']);
  });

  it('keeps the stored forbidden list when the import has none', () => {
    const { operations } = buildImportPlan({
      rows: [{ row: 2, en: 'Duty cycle', zhCN: '占空比寄存器', zhTW: '' }],
      existing: [{ ...existing, doNotUse: ['Duty cycle ratio'] }],
      existingTotal: 1,
      mode: 'append',
      strategy: 'overwrite',
      keepDefaults: false,
    });
    expect(operations.updates[0]?.doNotUse).toEqual(['Duty cycle ratio']);
  });
});

describe('P4-6 forbidden wording check (R7)', () => {
  const entries: GlossaryEntryView[] = [
    {
      id: 'e1',
      en: 'Duty cycle',
      zhCN: '占空比',
      zhTW: '',
      kind: 'term',
      specificity: 0.9,
      doNotUse: ['Duty cycle ratio', 'PWM ratio'],
    },
  ];

  it('reports a forbidden wording as a one-click suggestion', () => {
    const issues = checkForbiddenTerms({ draftText: 'The PWM ratio is 50%.', entries });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: 'R7',
      expected: 'Duty cycle',
      originalText: 'PWM ratio',
      suggestedText: 'Duty cycle',
      severity: 'suggestion',
    });
  });

  it('matches case and hyphen variants but ignores the approved wording', () => {
    const issues = checkForbiddenTerms({ draftText: 'duty-cycle-ratio and Duty cycle', entries });
    expect(issues.map((issue) => issue.sourceTerm)).toEqual(['duty-cycle-ratio']);
  });

  it('returns nothing when no forbidden wording appears', () => {
    expect(checkForbiddenTerms({ draftText: 'The duty cycle is 50%.', entries })).toEqual([]);
  });
});

describe('P4-4 usage report', () => {
  const entries: GlossaryEntryView[] = [
    { id: 'e1', en: 'Duty cycle', zhCN: '占空比', zhTW: '', kind: 'term', specificity: 0.9 },
    { id: 'e2', en: 'Dead time', zhCN: '死区时间', zhTW: '', kind: 'term', specificity: 0.9 },
    {
      id: 'e3',
      en: 'Pulse width modulation',
      zhCN: '脉宽调制',
      zhTW: '',
      kind: 'term',
      specificity: 0.9,
      doNotUse: ['PWM'],
    },
  ];

  it('classifies used / variant / missing and counts forbidden hits', () => {
    const report = buildUsageReport({
      text: 'The Duty cycle is set. dead-time is required. A PWM signal is used.',
      entries,
      tierOf: (id) => (id === 'e1' ? 'A' : 'B'),
    });
    const byId = new Map(report.rows.map((row) => [row.entryId, row]));
    expect(byId.get('e1')).toMatchObject({ status: 'used', occurrences: 1, tier: 'A' });
    expect(byId.get('e2')).toMatchObject({ status: 'variant', occurrences: 0, tier: 'B' });
    expect(byId.get('e2')?.variants).toEqual(['dead-time']);
    expect(byId.get('e3')).toMatchObject({ status: 'missing', forbidden: ['PWM'] });
    expect(report).toMatchObject({ total: 3, used: 1, variantOnly: 1, missing: 1, forbidden: 1 });
  });

  it('sorts actionable (missing) entries first', () => {
    const report = buildUsageReport({ text: 'Duty cycle', entries });
    expect(report.rows[0]?.entryId).not.toBe('e1');
  });

  it('handles an empty document', () => {
    const report = buildUsageReport({ text: '', entries });
    expect(report).toMatchObject({ total: 3, used: 0, missing: 3, checkedChars: 0 });
  });
});

describe('P4-7 vector snapshot', () => {
  it('round-trips ids, vectors and fingerprint', () => {
    const file = path.join(tmpDir, 'vectors.bin');
    const dims = 3;
    const data = new Float32Array([1, 0, 0, 0, 1, 0]);
    saveVectorSnapshot(file, { dims, ids: ['a', 'b'], data, fingerprint: 'fp1' });
    const loaded = loadVectorSnapshot(file);
    expect(loaded).not.toBeNull();
    expect(loaded?.ids).toEqual(['a', 'b']);
    expect(loaded?.dims).toBe(dims);
    expect(Array.from(loaded?.data ?? [])).toEqual(Array.from(data));
    expect(loaded?.fingerprint).toBe('fp1');
  });

  it('rejects missing / corrupt snapshot files', () => {
    expect(loadVectorSnapshot(path.join(tmpDir, 'nope.bin'))).toBeNull();
    const file = path.join(tmpDir, 'bad.bin');
    fs.writeFileSync(file, Buffer.from('not a snapshot'));
    expect(loadVectorSnapshot(file)).toBeNull();
  });

  it('fingerprint changes when an entry hash changes', () => {
    const a = snapshotFingerprint('m', 3, [{ entryId: 'e1', contentHash: 'h1' }]);
    const b = snapshotFingerprint('m', 3, [{ entryId: 'e1', contentHash: 'h2' }]);
    const c = snapshotFingerprint('m2', 3, [{ entryId: 'e1', contentHash: 'h1' }]);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('loads a snapshot into a VectorIndex and searches it', () => {
    const index = new VectorIndex();
    const ok = index.loadSnapshot(['a', 'b'], new Float32Array([1, 0, 0, 0, 1, 0]), 3);
    expect(ok).toBe(true);
    expect(index.size).toBe(2);
    const hits = index.topK(new Float32Array([0.9, 0.1, 0]), 1, 0.5);
    expect(hits[0]?.entryId).toBe('a');
  });

  it('rejects a snapshot whose shape does not match', () => {
    const index = new VectorIndex();
    expect(index.loadSnapshot(['a', 'b'], new Float32Array([1, 0, 0]), 3)).toBe(false);
  });
});
