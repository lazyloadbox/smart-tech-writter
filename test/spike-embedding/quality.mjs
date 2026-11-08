// P0-5 quality probe — does the local embedding layer actually find the right
// glossary entry on the eval fixtures?
//
//   node test/spike-embedding/quality.mjs --model-dir test/spike-embedding/models/multilingual-e5-small-int8
//   node test/spike-embedding/quality.mjs --model-dir test/spike-embedding/models/multilingual-e5-small-fp16
//
// Method (mirrors how L4 will be used): glossary entries are the passage index;
// every sentence of the eval cases is a query. For each labeled expectation the
// sentence that is semantically closest to the entry is picked, and the rank of
// the correct entry in that query's retrieval list is recorded. Concept-only
// expectations are exactly the ones L1/L2 cannot reach, so their recall@5 is
// the value L4 adds.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cosine, createEmbedder } from './embed.mjs';
import { normalizeEn, visibilityOf } from '../../scripts/eval-glossary.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = path.join(HERE, '..', 'glossary-eval');

function parseArgs(argv) {
  const opts = {
    modelDir: path.join(HERE, 'models', 'multilingual-e5-small-int8'),
    backend: 'native',
    threads: 4,
    passageFormat: 'en-zh',
    json: path.join(HERE, 'results', 'quality.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model-dir') opts.modelDir = path.resolve(argv[++i]);
    else if (argv[i] === '--backend') opts.backend = argv[++i];
    else if (argv[i] === '--threads') opts.threads = Number(argv[++i]);
    else if (argv[i] === '--passage-format') opts.passageFormat = argv[++i];
    else if (argv[i] === '--json') opts.json = path.resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return opts;
}

function splitSentences(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .split(/[。！？!?\n]|\.\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 6);
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index];
}

/** "占空比（多处）" → "占空比" — approximates what L5a hands to L4. */
function cleanEvidence(evidence) {
  return String(evidence ?? '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[「」“”"']/g, ' ')
    .split(/[、,，;；/]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(rows, field) {
  const total = rows.length;
  const at = (k) => (total === 0 ? 0 : rows.filter((row) => row[field] <= k && row[field] > 0).length / total);
  const scores = rows.map((row) => row[`${field.replace('Rank', 'Score')}`]).sort((a, b) => a - b);
  return {
    total,
    recall1: at(1),
    recall3: at(3),
    recall5: at(5),
    recall10: at(10),
    correctScore: {
      p25: quantile(scores, 0.25),
      p50: quantile(scores, 0.5),
      p75: quantile(scores, 0.75),
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const glossary = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'glossary.json'), 'utf-8'));
  const entryNames = glossary.map((entry) => entry.en);
  const passages = glossary.map((entry) =>
    opts.passageFormat === 'en' ? entry.en : `${entry.en} | ${entry.zhCN ?? ''}`,
  );

  const casesDir = path.join(EVAL_DIR, 'cases');
  const expectedDir = path.join(EVAL_DIR, 'expected');
  const cases = fs
    .readdirSync(casesDir)
    .filter((file) => /\.(md|dita|txt)$/i.test(file))
    .sort()
    .map((file) => {
      const base = path.basename(file, path.extname(file));
      const text = fs.readFileSync(path.join(casesDir, file), 'utf-8');
      const expected = JSON.parse(fs.readFileSync(path.join(expectedDir, `${base}.json`), 'utf-8'));
      return { base, text, sentences: splitSentences(text), expected: expected.expected ?? [] };
    });

  const embedder = await createEmbedder({ backend: opts.backend, modelDir: opts.modelDir, threads: opts.threads });
  const passageVectors = (await embedder.embed(passages, { kind: 'passage' })).vectors;

  const rows = [];
  for (const testCase of cases) {
    const sentenceVectors = (await embedder.embed(testCase.sentences, { kind: 'query' })).vectors;

    for (const item of testCase.expected) {
      const entryIndex = entryNames.findIndex((en) => normalizeEn(en) === normalizeEn(item.en));
      if (entryIndex < 0) continue;

      // (a) full-sentence query: pick the sentence that talks about this entry most.
      let queryIndex = -1;
      let querySim = -2;
      for (let s = 0; s < sentenceVectors.length; s++) {
        const sim = cosine(sentenceVectors[s], passageVectors[entryIndex]);
        if (sim > querySim) {
          querySim = sim;
          queryIndex = s;
        }
      }
      const rankAgainst = (queryVector) => {
        const ranked = passageVectors
          .map((vector, index) => ({ index, sim: cosine(queryVector, vector) }))
          .sort((a, b) => b.sim - a.sim);
        const rank = ranked.findIndex((candidate) => candidate.index === entryIndex) + 1;
        return { rank, top1: entryNames[ranked[0].index], top1Sim: ranked[0].sim, correctSim: ranked[rank - 1].sim };
      };

      const sentence = rankAgainst(sentenceVectors[queryIndex]);
      // (b) short evidence-term query — what L5a candidates / review noun phrases look like.
      const evidence = cleanEvidence(item.evidence) || testCase.sentences[queryIndex];
      const evidenceVector = (await embedder.embed([evidence], { kind: 'query' })).vectors[0];
      const evidenceHit = rankAgainst(evidenceVector);

      const visibility = visibilityOf(testCase.text, glossary[entryIndex]);
      rows.push({
        caseId: testCase.base,
        en: item.en,
        kind: item.kind ?? 'exact',
        literal: visibility.exact || visibility.variant,
        sentenceRank: sentence.rank,
        sentenceScore: sentence.correctSim,
        sentenceTop1: sentence.top1,
        sentenceQuery: testCase.sentences[queryIndex],
        evidence,
        evidenceRank: evidenceHit.rank,
        evidenceScore: evidenceHit.correctSim,
        evidenceTop1: evidenceHit.top1,
      });
    }
  }

  const kindRows = (kind) => rows.filter((row) => row.kind === kind);
  const report = {
    sentence: { all: summarize(rows, 'sentenceRank') },
    evidence: { all: summarize(rows, 'evidenceRank') },
  };
  for (const kind of ['exact', 'variant', 'concept']) {
    report.sentence[kind] = summarize(kindRows(kind), 'sentenceRank');
    report.evidence[kind] = summarize(kindRows(kind), 'evidenceRank');
  }

  const format = (label, s) =>
    `${label.padEnd(9)} n=${String(s.total).padStart(3)}  R@1 ${(s.recall1 * 100).toFixed(0).padStart(3)}%  ` +
    `R@3 ${(s.recall3 * 100).toFixed(0).padStart(3)}%  R@5 ${(s.recall5 * 100).toFixed(0).padStart(3)}%  ` +
    `R@10 ${(s.recall10 * 100).toFixed(0).padStart(3)}%  sim(p25/50/75) ` +
    `${s.correctScore.p25.toFixed(3)}/${s.correctScore.p50.toFixed(3)}/${s.correctScore.p75.toFixed(3)}`;

  console.log(`L4 quality — ${path.basename(opts.modelDir)} (${opts.backend}, index=${opts.passageFormat})`);
  console.log('\nquery = full sentence');
  for (const kind of ['all', 'exact', 'variant', 'concept']) console.log(format(kind, report.sentence[kind]));
  console.log('\nquery = short evidence term (L5a-style candidate)');
  for (const kind of ['all', 'exact', 'variant', 'concept']) console.log(format(kind, report.evidence[kind]));

  const misses = rows.filter((row) => row.evidenceRank > 5).slice(0, 10);
  if (misses.length > 0) {
    console.log('\nmisses with evidence query (rank > 5):');
    for (const miss of misses) {
      console.log(`  - [${miss.kind}] ${miss.en} ← "${miss.evidence}" → rank ${miss.evidenceRank}; top1 "${miss.evidenceTop1}"`);
    }
  }

  fs.mkdirSync(path.dirname(opts.json), { recursive: true });
  fs.writeFileSync(
    opts.json,
    JSON.stringify(
      {
        model: path.basename(opts.modelDir),
        backend: opts.backend,
        passageFormat: opts.passageFormat,
        report,
        rows,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
  console.log(`\nwrote ${path.relative(process.cwd(), opts.json)}`);
  await embedder.dispose?.();
}

main().catch((err) => {
  console.error('quality probe failed:', err);
  process.exit(1);
});
