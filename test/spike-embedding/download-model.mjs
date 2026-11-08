// P0-5 spike: download the local embedding model into a staging model folder.
//
//   node test/spike-embedding/download-model.mjs            # download + verify
//   node test/spike-embedding/download-model.mjs --force    # re-download
//   node test/spike-embedding/download-model.mjs --mirror https://hf-mirror.com
//
// Files land in test/spike-embedding/models/<modelId>/ (gitignored). The script
// streams each file to `.part` and only renames it into place after the size and
// SHA-256 checks pass — the same "staging → verify → atomic enable" flow the
// production installer will use (design §2.5.6.6).
//
// If test/spike-embedding/model-manifest.json exists, its hashes act as the
// trusted allow-list: a mismatch aborts and deletes the staged file. On the
// first run the manifest is written from the downloaded artifacts.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const VARIANTS = {
  quantized: {
    modelId: 'multilingual-e5-small-int8',
    modelFile: { remote: 'onnx/model_quantized.onnx', local: 'model_quantized.onnx' },
  },
  fp16: {
    modelId: 'multilingual-e5-small-fp16',
    modelFile: { remote: 'onnx/model_fp16.onnx', local: 'model_fp16.onnx' },
  },
  fp32: {
    modelId: 'multilingual-e5-small-fp32',
    modelFile: { remote: 'onnx/model.onnx', local: 'model.onnx' },
  },
};

const FILES = [
  { remote: 'tokenizer.json', local: 'tokenizer.json', label: 'tokenizer' },
  { remote: 'config.json', local: 'config.json', label: 'config' },
];

function parseArgs(argv) {
  const opts = {
    source: 'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main',
    variant: 'quantized',
    force: false,
    modelDir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mirror') opts.source = argv[++i];
    else if (argv[i] === '--source') opts.source = argv[++i];
    else if (argv[i] === '--variant') opts.variant = argv[++i];
    else if (argv[i] === '--force') opts.force = true;
    else if (argv[i] === '--out') opts.modelDir = path.resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!opts.source.startsWith('https://')) throw new Error('only HTTPS sources are allowed');
  if (!VARIANTS[opts.variant]) throw new Error(`unknown variant: ${opts.variant} (use quantized|fp16|fp32)`);
  opts.modelDir ??= path.join(HERE, 'models', VARIANTS[opts.variant].modelId);
  return opts;
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function download(url, dest, label) {
  const part = `${dest}.part`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length')) ?? 0;

  let received = 0;
  let lastLogged = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    received += chunk.length;
    if (total > 0 && received - lastLogged > total * 0.2) {
      lastLogged = received;
      const pct = ((received / total) * 100).toFixed(0);
      console.log(`    ${label}: ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`);
    }
  });

  await pipeline(body, fs.createWriteStream(part));
  if (total > 0 && received !== total) {
    fs.rmSync(part, { force: true });
    throw new Error(`${label}: truncated download (${received}/${total} bytes)`);
  }
  return part;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const variant = VARIANTS[opts.variant];
  fs.mkdirSync(opts.modelDir, { recursive: true });

  const files = [variant.modelFile, ...FILES];
  const manifestPath = path.join(HERE, `model-manifest-${opts.variant}.json`);
  const trusted = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : null;
  const installed = { modelId: variant.modelId, source: opts.source, installedAt: new Date().toISOString(), files: {} };

  for (const file of files) {
    const dest = path.join(opts.modelDir, file.local);
    const expected = trusted?.files?.[file.local];

    if (fs.existsSync(dest) && !opts.force) {
      const actual = await sha256(dest);
      if (expected && expected.sha256 !== actual) {
        throw new Error(`${file.local}: existing file does not match the trusted manifest (delete it or use --force)`);
      }
      console.log(`✔ ${file.local} already present (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
      installed.files[file.local] = { size: fs.statSync(dest).size, sha256: actual };
      continue;
    }

    console.log(`⬇ ${file.local} ← ${opts.source}/${file.remote}`);
    const part = await download(`${opts.source}/${file.remote}`, dest, file.local);
    const actual = await sha256(part);

    if (expected && expected.sha256 !== actual) {
      fs.rmSync(part, { force: true });
      throw new Error(`${file.local}: SHA-256 mismatch (expected ${expected.sha256}, got ${actual})`);
    }

    fs.renameSync(part, dest);
    const size = fs.statSync(dest).size;
    installed.files[file.local] = { size, sha256: actual };
    console.log(`✔ ${file.local} (${(size / 1024 / 1024).toFixed(1)} MB, sha256 ${actual.slice(0, 12)}…)`);
  }

  fs.writeFileSync(path.join(opts.modelDir, 'installed.json'), JSON.stringify(installed, null, 2) + '\n', 'utf-8');

  if (!trusted) {
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          format: 1,
          modelId: variant.modelId,
          revision: 'r1',
          dims: 384,
          maxTokens: 64,
          prefix: { query: 'query: ', passage: 'passage: ' },
          files: installed.files,
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    console.log(`wrote ${path.basename(manifestPath)} (trusted hash allow-list for subsequent runs)`);
  }

  console.log(`\nModel ready: ${path.relative(process.cwd(), opts.modelDir)}`);
}

main().catch((err) => {
  console.error(`✖ ${err.message ?? err}`);
  process.exit(1);
});
