// Evaluation regression for the real L1–L3 engine (design §2.5.1 / P2a).
//
// The P0-4 harness (`scripts/eval-glossary.mjs`) measured the *ceiling* with a
// regex approximation of L1/L2. This test runs the actual `GlossaryIndex`
// against the same fixtures, so the engine cannot silently regress below the
// acceptance target ("精确/变体召回 ≥ 99 %", design §2.5.1).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GlossaryIndex, type GlossaryIndexRow } from '../../src/main/modules/glossary/index/glossary-index';
import type { GlossaryEntryKind } from '../../src/shared/types/mapping.types';

const EVAL_DIR = path.resolve(__dirname, '../glossary-eval');

interface GlossaryEntry {
  en: string;
  zhCN: string;
  zhTW?: string;
}

interface ExpectedFile {
  caseId: string;
  sourceLang: 'en' | 'zh-CN' | 'mixed';
  expected: { en: string; kind: 'exact' | 'variant' | 'concept'; evidence: string }[];
}

function loadGlossary(): GlossaryIndexRow[] {
  const rows = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'glossary.json'), 'utf-8')) as GlossaryEntry[];
  return rows.map((row, index) => ({
    id: `eval-${index}`,
    en: row.en,
    zhCN: row.zhCN,
    zhTW: row.zhTW ?? '',
    kind: (row.en.split(/\s+/).length > 6 ? 'phrase' : 'term') as GlossaryEntryKind,
  }));
}

function loadCaseFile(base: string): string {
  const dir = path.join(EVAL_DIR, 'cases');
  const names = fs.readdirSync(dir);
  const stem = base.replace(/\.(md|dita)$/, '');
  const file =
    names.find((name) => name === base) ??
    names.find((name) => name.startsWith(`${base}.`)) ??
    names.find((name) => name.startsWith(`${stem}.`));
  if (!file) throw new Error(`missing case file for ${base}`);
  return fs.readFileSync(path.join(dir, file), 'utf-8');
}

interface Measurement {
  caseId: string;
  expected: number;
  exactOrVariant: number;
  found: number;
  missed: string[];
  concept: number;
  conceptFound: number;
}

function measure(): Measurement[] {
  const rows = loadGlossary();
  const index = new GlossaryIndex(rows);
  const expectedDir = path.join(EVAL_DIR, 'expected');
  const results: Measurement[] = [];

  for (const file of fs.readdirSync(expectedDir).filter((f) => f.endsWith('.json')).sort()) {
    const expected = JSON.parse(
      fs.readFileSync(path.join(expectedDir, file), 'utf-8')
    ) as ExpectedFile;
    const text = loadCaseFile(expected.caseId);
    // The engine always matches both language sides: source material is often
    // mixed (Chinese notes with English identifiers), so restricting to one
    // side loses recall without helping precision.
    const matches = index.match(text, { side: 'both', enableFuzzy: true, fuzzyThreshold: 0.75 });
    const matchedEntries = new Set(
      matches
        .map((m) => index.getEntry(m.entryId)?.en)
        .filter((en): en is string => Boolean(en))
    );

    const literal = expected.expected.filter((item) => item.kind !== 'concept');
    const concepts = expected.expected.filter((item) => item.kind === 'concept');
    const found = literal.filter((item) => matchedEntries.has(item.en));
    const conceptFound = concepts.filter((item) => matchedEntries.has(item.en));

    results.push({
      caseId: expected.caseId,
      expected: literal.length,
      exactOrVariant: literal.length,
      found: found.length,
      missed: literal.filter((item) => !matchedEntries.has(item.en)).map((item) => item.en),
      concept: concepts.length,
      conceptFound: conceptFound.length,
    });
  }

  return results;
}

describe('glossary engine evaluation (P2a acceptance)', () => {
  const results = measure();

  it('reaches the L1/L2 recall target on the fixture set', () => {
    for (const result of results) {
      // eslint-disable-next-line no-console
      console.log(
        `${result.caseId}: ${result.found}/${result.expected} literal` +
          (result.concept > 0 ? `, ${result.conceptFound}/${result.concept} concept` : '') +
          (result.missed.length > 0 ? ` — missed: ${result.missed.join(', ')}` : '')
      );
    }

    const totalExpected = results.reduce((sum, r) => sum + r.expected, 0);
    const totalFound = results.reduce((sum, r) => sum + r.found, 0);
    const recall = totalExpected > 0 ? totalFound / totalExpected : 1;

    expect(recall).toBeGreaterThanOrEqual(0.99);
  });
});
