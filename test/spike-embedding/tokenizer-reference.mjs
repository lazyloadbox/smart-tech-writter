// P0-5 tokenizer parity: compare our pure-JS XLM-R tokenizer with the official
// HuggingFace `tokenizers` binding (installed in a temp folder, never a project
// dependency).
//
//   $tmp = "$env:TEMP\stw-tokenizers-ref"; npm i --prefix $tmp tokenizers@0.23.2
//   node test/spike-embedding/tokenizer-reference.mjs --ref $tmp

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XlmrTokenizer } from './tokenizer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = path.join(HERE, 'models', 'multilingual-e5-small-int8');
const EVAL_DIR = path.join(HERE, '..', 'glossary-eval');

function parseArgs(argv) {
  let ref = path.join(process.env.TEMP ?? process.env.TMP ?? '/tmp', 'stw-tokenizers-ref');
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--ref') ref = path.resolve(argv[++i]);
  return { ref };
}

function buildSamples() {
  const samples = [
    'duty cycle',
    '占空比',
    'Pulse Width Modulation',
    '连接 EC2 时出现 UNKNOWN 错误',
    'naïve café １２３',
    'a  b   c',
    'line1\nline2\ttabbed',
    'NBSP\u00A0inside',
    'zero\u200Bwidth',
    'emoji 😀 mixed 中文 text',
    'Q: what is PWM? A: pulse-width modulation.',
    'Ｆｕｌｌｗｉｄｔｈ ＡＢＣ １２３',
    'ÀÉÎÕÜ àéîõü ß æøå',
    'Ελληνικά русский 中文混合',
    '  leading and trailing spaces  ',
    'R5. Do not disconnect the power supply during a firmware update.',
  ];

  const glossary = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'glossary.json'), 'utf-8'));
  for (const entry of glossary) samples.push(entry.en, entry.zhCN ?? '');

  const casesDir = path.join(EVAL_DIR, 'cases');
  for (const file of fs.readdirSync(casesDir).filter((f) => /\.(md|dita)$/i.test(f))) {
    const text = fs.readFileSync(path.join(casesDir, file), 'utf-8').replace(/<[^>]+>/g, ' ');
    for (const sentence of text.split(/[。！？!?\n]|\n/)) {
      if (sentence.trim().length > 0) samples.push(sentence.trim());
    }
  }
  return samples.filter((sample) => sample.length > 0);
}

const REF_RUNNER = `
const fs = require('node:fs');
const { Tokenizer } = require('tokenizers');
(async () => {
  const [, , tokenizerPath, textsPath, outPath] = process.argv;
  const tokenizer = await Tokenizer.fromFile(tokenizerPath);
  const texts = JSON.parse(fs.readFileSync(textsPath, 'utf-8'));
  const ids = [];
  for (const text of texts) {
    const encoding = await tokenizer.encode(text, null, { addSpecialTokens: true });
    ids.push(encoding.getIds());
  }
  fs.writeFileSync(outPath, JSON.stringify(ids));
})().catch((err) => { console.error(err); process.exit(1); });
`;

function main() {
  const { ref } = parseArgs(process.argv.slice(2));
  const refModule = path.join(ref, 'node_modules', 'tokenizers');
  if (!fs.existsSync(refModule)) {
    console.error(`reference tokenizers package not found at ${refModule}`);
    process.exit(1);
  }

  const samples = buildSamples();
  const workDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'stw-tok-'));
  const textsPath = path.join(workDir, 'texts.json');
  const outPath = path.join(workDir, 'ids.json');
  const runnerPath = path.join(ref, 'ref-runner.cjs');

  fs.writeFileSync(textsPath, JSON.stringify(samples), 'utf-8');
  fs.writeFileSync(runnerPath, REF_RUNNER, 'utf-8');

  const result = spawnSync(process.execPath, [runnerPath, path.join(MODEL_DIR, 'tokenizer.json'), textsPath, outPath], {
    cwd: ref,
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    console.error('reference tokenizer failed:', result.stderr || result.stdout);
    process.exit(1);
  }

  const expected = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
  const tokenizer = XlmrTokenizer.fromModelDir(MODEL_DIR);

  let exact = 0;
  const mismatches = [];
  for (let i = 0; i < samples.length; i++) {
    const ours = tokenizer.encode(samples[i], { maxLength: 512, addSpecialTokens: true });
    const refIds = expected[i];
    if (ours.inputIds.length === refIds.length && ours.inputIds.every((id, index) => id === refIds[index])) {
      exact++;
    } else {
      mismatches.push({ text: samples[i], ours: ours.tokens.join(' | '), refLen: refIds.length, ourLen: ours.inputIds.length });
    }
  }

  console.log(`tokenizer parity: ${exact}/${samples.length} exact id sequences`);
  for (const mismatch of mismatches.slice(0, 12)) {
    console.log(`  ✖ "${mismatch.text.slice(0, 60)}" — ref ${mismatch.refLen} ids vs ours ${mismatch.ourLen}`);
    console.log(`      ours: ${mismatch.ours}`);
  }

  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(
    path.join(HERE, 'results', 'tokenizer-parity.json'),
    JSON.stringify({ total: samples.length, exact, mismatches: mismatches.slice(0, 50) }, null, 2) + '\n',
    'utf-8',
  );
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(runnerPath, { force: true });
  process.exitCode = exact === samples.length ? 0 : 1;
}

main();
