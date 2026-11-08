// Glossary evaluation harness (P0-4).
//
// Establishes the *baseline* quality of the current glossary injection strategy
// (`getMappingContext`: the first 500 entries ordered by `en`, injected in full)
// and the ceiling that a selective matching engine (design §2.5: L1–L3 + L4/L5)
// could reach on the same fixtures.
//
//   node scripts/eval-glossary.mjs                 # measure
//   node scripts/eval-glossary.mjs --check         # validate fixtures + measure
//   node scripts/eval-glossary.mjs --check --write # also write baseline.json
//   npm run eval:glossary                          # = --check --write
//
// The curated glossary is padded with deterministic synthetic entries (`--fill`)
// so the table size matches the real-world 3k–5k scale; that is what makes the
// "first 500 alphabetically" baseline lose entries (design gap G6).
//
// Exit code: 0 normally; 1 when `--check` finds fixture problems.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    glossary: path.join(ROOT, 'test/glossary-eval/glossary.json'),
    cases: path.join(ROOT, 'test/glossary-eval/cases'),
    expected: path.join(ROOT, 'test/glossary-eval/expected'),
    fill: 3889,
    limit: 500,
    check: false,
    write: false,
    json: path.join(ROOT, 'test/glossary-eval/baseline.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === '--glossary') opts.glossary = path.resolve(next());
    else if (arg === '--cases') opts.cases = path.resolve(next());
    else if (arg === '--expected') opts.expected = path.resolve(next());
    else if (arg === '--fill') opts.fill = Number(next());
    else if (arg === '--limit') opts.limit = Number(next());
    else if (arg === '--json') opts.json = path.resolve(next());
    else if (arg === '--check') opts.check = true;
    else if (arg === '--write') opts.write = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf-8').split('\n').slice(0, 18).join('\n'));
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

// ── Normalization (design §2.4.3) ──────────────────────────────────────────
const cleanCell = (s) =>
  String(s ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');

const normalizeEn = (s) =>
  cleanCell(s)
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。;；:：]+$/, '')
    .toLowerCase();

const normalizeZh = (s) => cleanCell(s).normalize('NFKC').replace(/\s+/g, '').trim();

const enKeyOf = (entry) => normalizeEn(entry.en);

// ── Matching helpers (approximations of L1 / L2; L4/L5 are out of scope) ───
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wordBoundaryTest(haystack, needle) {
  if (!needle) return false;
  const pattern = escapeRegExp(needle).replace(/\\?\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?![a-z0-9])`).test(haystack);
}

const tokenize = (text) => text.split(/[^a-z0-9]+/).filter(Boolean);

/** Very light stemmer used only to model L2 word-form variants. */
function stem(token) {
  let t = token;
  if (t.length > 4 && t.endsWith('ies')) t = `${t.slice(0, -3)}y`;
  else if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith('es')) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1);
  if (t.length > 3 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

/** Contiguous stem sequence match: hyphen/space/plural/suffix tolerant. */
function tokenVariantTest(textTokens, enTokens) {
  if (enTokens.length === 0 || textTokens.length < enTokens.length) return false;
  const enStems = enTokens.map(stem);

  // Concatenated form, e.g. "Wake-up" → "wakeup".
  const joined = enTokens.join('');
  if (textTokens.some((token) => token === joined || stem(token) === joined)) return true;

  for (let start = 0; start <= textTokens.length - enStems.length; start++) {
    let ok = true;
    for (let j = 0; j < enStems.length; j++) {
      if (stem(textTokens[start + j]) !== enStems[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Acronym variant, e.g. "Pulse Width Modulation" → "PWM". */
function abbreviationTest(textTokens, en) {
  const words = en.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  if (words.length < 2) return false;
  const titleCase = words.every((w) => /^[A-Z]/.test(w));
  if (!titleCase) return false;
  const abbr = words.map((w) => w[0]).join('').toLowerCase();
  return textTokens.includes(abbr);
}

/**
 * @returns {{exact: boolean, variant: boolean}} how the entry is visible in the text.
 * `exact` mirrors L1 (literal in en or zh), `variant` mirrors L2 (hyphen, plural,
 * capitalization, acronym). Concept-level matches (L4/L5) are intentionally not modelled.
 */
function visibilityOf(text, entry) {
  const textEn = normalizeEn(text);
  const textZh = normalizeZh(text);

  const enExact = wordBoundaryTest(textEn, normalizeEn(entry.en));
  const zhExact = entry.zhCN ? textZh.includes(normalizeZh(entry.zhCN)) : false;
  if (enExact || zhExact) return { exact: true, variant: false };

  const textTokens = tokenize(textEn);
  const variant =
    tokenVariantTest(textTokens, tokenize(normalizeEn(entry.en))) || abbreviationTest(textTokens, entry.en);
  return { exact: false, variant };
}

// ── Fixtures ───────────────────────────────────────────────────────────────
function loadGlossary(filePath) {
  const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(entries)) throw new Error(`${filePath}: expected a JSON array`);
  return entries;
}

const FILLER_ADJ = [
  'Auxiliary', 'Balanced', 'Calibrated', 'Diagnostic', 'Embedded', 'Filtered', 'Generic', 'Hardware',
  'Industrial', 'Jittered', 'Kernel', 'Linear', 'Measured', 'Nominal', 'Optical', 'Parallel',
  'Quadrature', 'Realtime', 'Sampled', 'Timed', 'Unified', 'Verified', 'Wideband', 'Xenon',
  'Yieldable', 'Zeroed',
];
const FILLER_NOUN = [
  'actuator', 'baseline', 'calibration', 'descriptor', 'element', 'fixture', 'gauge', 'handler',
  'indicator', 'journal', 'ledger', 'matrix', 'node', 'object', 'profile', 'queue', 'record',
  'segment', 'token', 'window',
];

/** Deterministic synthetic padding so the table matches the 3k–5k production scale. */
function makeFiller(count) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const code = String(i).padStart(4, '0');
    const en = `${FILLER_ADJ[(i - 1) % FILLER_ADJ.length]} ${FILLER_NOUN[Math.floor((i - 1) / FILLER_ADJ.length) % FILLER_NOUN.length]} ${code}`;
    rows.push({ en, zhCN: `合成术语 ${code}`, kind: 'term', synthetic: true });
  }
  return rows;
}

const CASE_EXTENSIONS = new Set(['.md', '.dita', '.txt', '.xml', '.eml']);

function loadCases(casesDir) {
  return fs
    .readdirSync(casesDir)
    .filter((f) => CASE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort()
    .map((file) => {
      const base = path.basename(file, path.extname(file));
      return { base, file: path.join(casesDir, file), text: fs.readFileSync(path.join(casesDir, file), 'utf-8') };
    });
}

function loadExpected(expectedDir) {
  const map = new Map();
  for (const file of fs.readdirSync(expectedDir).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(expectedDir, file);
    const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
    map.set(path.basename(file, '.json'), { ...data, file: full });
  }
  return map;
}

// ── Token estimate (design §2.5.9) ─────────────────────────────────────────
function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.codePointAt(0) >= 0x2e80) cjk += 1;
    else other += 1;
  }
  return Math.ceil((cjk + other / 4) * 1.1);
}

const formatPairLine = (entry) => `"${entry.en}" | "${entry.zhCN ?? ''}"`;

// SQLite `ORDER BY en COLLATE NOCASE` (ASCII case-insensitive) approximation.
const byNoCase = (a, b) => {
  const ka = String(a.en).toLowerCase();
  const kb = String(b.en).toLowerCase();
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const curated = loadGlossary(opts.glossary);
  const filler = makeFiller(opts.fill);
  const table = [...curated, ...filler].sort(byNoCase);

  const curatedKeys = new Set(curated.map(enKeyOf));
  const injected = table.slice(0, opts.limit);
  const injectedKeys = new Set(injected.map(enKeyOf));

  const cases = loadCases(opts.cases);
  const expectedMap = loadExpected(opts.expected);

  const problems = [];
  const results = [];

  for (const testCase of cases) {
    const expected = expectedMap.get(testCase.base);
    if (!expected) {
      problems.push(`expected/<${testCase.base}>.json is missing for case ${testCase.base}`);
      continue;
    }

    const rows = [];
    for (const item of expected.expected ?? []) {
      const entry = curated.find((e) => enKeyOf(e) === normalizeEn(item.en));
      if (!entry) {
        problems.push(`${testCase.base}: expected entry "${item.en}" is not in ${path.basename(opts.glossary)}`);
        continue;
      }
      const visibility = visibilityOf(testCase.text, entry);
      const key = enKeyOf(entry);
      const isInjected = injectedKeys.has(key);
      const literal = visibility.exact || visibility.variant;
      const kind = item.kind;

      if (opts.check) {
        if (kind === 'exact' && !visibility.exact) {
          problems.push(`${testCase.base}: "${item.en}" declared exact but is not literally present`);
        } else if (kind === 'variant' && visibility.exact) {
          problems.push(`${testCase.base}: "${item.en}" declared variant but is literally present (use exact)`);
        } else if (kind === 'variant' && !visibility.variant) {
          problems.push(`${testCase.base}: "${item.en}" declared variant but no L2 variant matches`);
        } else if (kind === 'concept' && literal) {
          problems.push(`${testCase.base}: "${item.en}" declared concept but matches literally/variant`);
        }
      }

      rows.push({
        en: entry.en,
        kind,
        evidence: item.evidence ?? '',
        injected: isInjected,
        exact: visibility.exact,
        variant: visibility.variant,
        literalInjected: literal && isInjected,
      });
    }

    const expectedCount = rows.length;
    const injectedCount = rows.filter((r) => r.injected).length;
    const literalCount = rows.filter((r) => r.exact || r.variant).length;
    const literalInjectedCount = rows.filter((r) => r.literalInjected).length;
    const conceptCount = rows.filter((r) => r.kind === 'concept').length;

    results.push({
      caseId: testCase.base,
      sourceLang: expected.sourceLang ?? 'unknown',
      expectedTotal: expectedCount,
      injected: injectedCount,
      literal: literalCount,
      literalInjected: literalInjectedCount,
      conceptOnly: conceptCount,
      baselineRecall: expectedCount ? injectedCount / expectedCount : 0,
      baselineUsableRecall: expectedCount ? literalInjectedCount / expectedCount : 0,
      selectiveCeiling: expectedCount ? literalCount / expectedCount : 0,
      missingFromInjection: rows.filter((r) => !r.injected).map((r) => r.en),
      notLiteral: rows.filter((r) => !(r.exact || r.variant)).map((r) => r.en),
    });
  }

  // Filler must not interfere with any case text (guards the fixture itself).
  if (opts.check) {
    const keyCounts = new Map();
    for (const entry of curated) {
      const key = enKeyOf(entry);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of keyCounts) {
      if (count > 1) problems.push(`duplicate en_key in glossary: "${key}" (${count} rows)`);
    }
    for (const testCase of cases) {
      const textEn = normalizeEn(testCase.text);
      const clash = filler.find((f) => textEn.includes(normalizeEn(f.en)));
      if (clash) problems.push(`${testCase.base}: synthetic filler "${clash.en}" appears in the case text`);
    }
  }

  // Token cost: full injected block vs. only the entries that are actually hit.
  const injectedBlockTokens = estimateTokens(injected.map(formatPairLine).join('\n'));
  const hitEntries = [];
  const seenHit = new Set();
  for (const testCase of cases) {
    for (const item of expectedMap.get(testCase.base)?.expected ?? []) {
      const entry = curated.find((e) => enKeyOf(e) === normalizeEn(item.en));
      if (!entry) continue;
      const key = enKeyOf(entry);
      if (seenHit.has(key)) continue;
      const visibility = visibilityOf(testCase.text, entry);
      if (visibility.exact || visibility.variant) {
        seenHit.add(key);
        hitEntries.push(entry);
      }
    }
  }
  const hitBlockTokens = estimateTokens(hitEntries.map(formatPairLine).join('\n'));
  const tokenWasteRatio = injectedBlockTokens > 0 ? 1 - hitBlockTokens / injectedBlockTokens : 0;

  // ── Report ───────────────────────────────────────────────────────────────
  const totals = results.reduce(
    (acc, r) => {
      acc.expected += r.expectedTotal;
      acc.injected += r.injected;
      acc.literal += r.literal;
      acc.literalInjected += r.literalInjected;
      acc.concept += r.conceptOnly;
      return acc;
    },
    { expected: 0, injected: 0, literal: 0, literalInjected: 0, concept: 0 },
  );
  const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

  console.log('');
  console.log(`📚 Glossary eval — baseline (full injection: first ${opts.limit} of ${table.length} entries, zh-CN)`);
  console.log(`   curated ${curated.length} + synthetic ${filler.length} entries · ${cases.length} cases`);
  console.log('');
  const header = ['case', 'expected', 'injected', 'literal', 'lit+inj', 'ceiling'];
  const width = Math.max(header[0].length, ...results.map((r) => r.caseId.length));
  console.log(`  ${header[0].padEnd(width)}  ${header.slice(1).map((h) => h.padStart(8)).join('  ')}`);
  for (const r of results) {
    console.log(
      `  ${r.caseId.padEnd(width)}  ${String(r.expectedTotal).padStart(8)}  ${String(r.injected).padStart(8)}  ` +
        `${String(r.literal).padStart(8)}  ${String(r.literalInjected).padStart(8)}  ${pct(r.literal, r.expectedTotal).padStart(8)}`,
    );
  }
  console.log('  ' + '-'.repeat(width + 52));
  console.log(
    `  ${'TOTAL'.padEnd(width)}  ${String(totals.expected).padStart(8)}  ${String(totals.injected).padStart(8)}  ` +
      `${String(totals.literal).padStart(8)}  ${String(totals.literalInjected).padStart(8)}  ${pct(totals.literal, totals.expected).padStart(8)}`,
  );
  console.log('');
  console.log(`  · baseline injectable recall      ${pct(totals.injected, totals.expected)}  (entry is even present in the prompt)`);
  console.log(`  · baseline usable recall          ${pct(totals.literalInjected, totals.expected)}  (present AND literally findable)`);
  console.log(`  · selective engine ceiling        ${pct(totals.literal, totals.expected)}  (L1/L2 can reach this once injection is selective)`);
  console.log(`  · concept-only expectations       ${totals.concept}  (need L4 semantic or L5 AI candidates)`);
  console.log(
    `  · token cost                      injected ≈ ${injectedBlockTokens.toLocaleString()} vs hit-only ≈ ${hitBlockTokens.toLocaleString()} ` +
      `(waste ${pct(Math.round(tokenWasteRatio * 1000), 1000)})`,
  );

  const droppedNotable = results.flatMap((r) => r.missingFromInjection);
  if (droppedNotable.length > 0) {
    console.log('');
    console.log(`  · expected entries never injected (${droppedNotable.length}):`);
    for (const en of droppedNotable.slice(0, 12)) console.log(`      - ${en}`);
    if (droppedNotable.length > 12) console.log(`      … and ${droppedNotable.length - 12} more`);
  }

  if (problems.length > 0) {
    console.log('');
    console.log(`⚠ fixture check: ${problems.length} problem(s)`);
    for (const problem of problems) console.log(`      - ${problem}`);
  } else if (opts.check) {
    console.log('');
    console.log('✔ fixture check: expected labels, glossary keys and filler isolation are consistent');
  }

  if (opts.write) {
    const report = {
      generatedAt: new Date().toISOString().slice(0, 10),
      config: {
        glossary: path.relative(ROOT, opts.glossary),
        cases: path.relative(ROOT, opts.cases),
        expected: path.relative(ROOT, opts.expected),
        limit: opts.limit,
        fill: opts.fill,
      },
      glossary: { curated: curated.length, synthetic: filler.length, total: table.length },
      summary: {
        expected: totals.expected,
        injected: totals.injected,
        literal: totals.literal,
        literalInjected: totals.literalInjected,
        conceptOnly: totals.concept,
        baselineRecall: totals.expected ? totals.injected / totals.expected : 0,
        baselineUsableRecall: totals.expected ? totals.literalInjected / totals.expected : 0,
        selectiveCeiling: totals.expected ? totals.literal / totals.expected : 0,
      },
      tokenCost: {
        injectedBlockTokens,
        hitBlockTokens,
        wasteRatio: tokenWasteRatio,
      },
      cases: results,
    };
    fs.writeFileSync(opts.json, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    console.log('');
    console.log(`✔ wrote ${path.relative(ROOT, opts.json)}`);
  }

  if (problems.length > 0) process.exitCode = 1;
}

export { estimateTokens, makeFiller, normalizeEn, normalizeZh, visibilityOf };

const isDirectRun =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) main();
