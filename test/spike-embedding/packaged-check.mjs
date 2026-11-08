// P0-5 packaged-app check: does the ONNX stack work from the *packaged* tree?
//
//   npm run package
//   npx electron test/spike-embedding/packaged-check.mjs --resources=out/smart-tech-writter-win32-x64/resources
//
// Verifies that:
//   1. the native binding + onnxruntime.dll + the WASM runner are outside app.asar;
//   2. `require()` of onnxruntime-node *through the asar path* loads and runs;
//   3. `require()` of onnxruntime-web through the asar path runs the WASM backend;
//   4. both packaged backends produce the same vectors as the dev tree would.
//
// The model lives in test/spike-embedding/models and is passed by absolute path,
// exactly like the production installer's userData models folder.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const resourcesArg = args.find((arg) => arg.startsWith('--resources='));
const resourcesDir = path.resolve(
  process.cwd(),
  resourcesArg ? resourcesArg.split('=')[1] : 'out/smart-tech-writter-win32-x64/resources',
);
const appAsar = path.join(resourcesDir, 'app.asar');
const unpacked = path.join(resourcesDir, 'app.asar.unpacked');

const MODEL_DIR = path.resolve(process.cwd(), 'test/spike-embedding/models/multilingual-e5-small-int8');
const MODEL_PATH = path.join(MODEL_DIR, 'model_quantized.onnx');

const results = { resourcesDir, checks: [], ok: true };
const check = (name, pass, detail) => {
  results.checks.push({ name, pass, detail });
  if (!pass) results.ok = false;
};

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedWith(ort, session) {
  const ids = [0n, 5798n, 12370n, 2n]; // <s> ▁du ty </s> (just a stable sample)
  const feeds = {};
  if (session.inputNames.includes('input_ids')) feeds.input_ids = new ort.Tensor('int64', BigInt64Array.from(ids), [1, ids.length]);
  if (session.inputNames.includes('attention_mask')) {
    feeds.attention_mask = new ort.Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]);
  }
  if (session.inputNames.includes('token_type_ids')) {
    feeds.token_type_ids = new ort.Tensor('int64', BigInt64Array.from(ids.map(() => 0n)), [1, ids.length]);
  }
  const output = await session.run(feeds);
  const tensor = output.last_hidden_state ?? output[session.outputNames[0]];
  const [, seq, dims] = tensor.dims;
  const pooled = new Float32Array(dims);
  for (let s = 0; s < seq; s++) {
    for (let d = 0; d < dims; d++) pooled[d] += tensor.data[s * dims + d];
  }
  let norm = 0;
  for (let d = 0; d < dims; d++) {
    pooled[d] /= seq;
    norm += pooled[d] * pooled[d];
  }
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dims; d++) pooled[d] /= norm;
  return pooled;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    check('app.asar exists', fs.existsSync(appAsar), appAsar);
    check('app.asar.unpacked exists', fs.existsSync(unpacked), unpacked);
    check('model file present', fs.existsSync(MODEL_PATH), MODEL_PATH);

    const bindingRel = 'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node';
    const dllRel = 'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll';
    const wasmRel = 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm';
    const wasmJsRel = 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs';
    check('native binding unpacked', fs.existsSync(path.join(unpacked, bindingRel)), bindingRel);
    check('onnxruntime.dll unpacked', fs.existsSync(path.join(unpacked, dllRel)), dllRel);
    check('wasm runner unpacked', fs.existsSync(path.join(unpacked, wasmRel)), wasmRel);
    check('wasm loader module unpacked', fs.existsSync(path.join(unpacked, wasmJsRel)), wasmJsRel);

    // ── package size accounting (unpacked native + wasm assets) ────────────
    const assets = [bindingRel, dllRel, wasmRel, wasmJsRel]
      .filter((rel) => fs.existsSync(path.join(unpacked, rel)))
      .map((rel) => ({ rel, bytes: fs.statSync(path.join(unpacked, rel)).size }));
    const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
    results.assets = assets.map((asset) => ({ file: path.basename(asset.rel), mb: +(asset.bytes / 1024 / 1024).toFixed(1) }));
    results.unpackedAssetsMb = +(totalBytes / 1024 / 1024).toFixed(1);

    // ── native backend, module resolved through app.asar ───────────────────
    const nativeOrt = require(path.join(appAsar, 'node_modules/onnxruntime-node'));
    const nativeStarted = performance.now();
    const nativeSession = await nativeOrt.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'] });
    const nativeLoadMs = performance.now() - nativeStarted;
    const nativeVector = await embedWith(nativeOrt, nativeSession);
    check('native inference from asar', nativeVector.length === 384, `${nativeVector.length} dims, load ${nativeLoadMs.toFixed(0)} ms`);

    // ── WASM backend, module resolved through app.asar, wasm from unpacked ──
    const wasmOrt = require(path.join(appAsar, 'node_modules/onnxruntime-web'));
    wasmOrt.env.wasm.numThreads = 1;
    wasmOrt.env.wasm.simd = true;
    wasmOrt.env.wasm.wasmPaths = pathToFileURL(path.join(unpacked, 'node_modules/onnxruntime-web/dist') + path.sep).href;
    const wasmStarted = performance.now();
    const wasmSession = await wasmOrt.InferenceSession.create(MODEL_PATH, { executionProviders: ['wasm'] });
    const wasmLoadMs = performance.now() - wasmStarted;
    const wasmVector = await embedWith(wasmOrt, wasmSession);
    check('wasm inference from asar', wasmVector.length === 384, `${wasmVector.length} dims, load ${wasmLoadMs.toFixed(0)} ms`);

    const parity = cosine(nativeVector, wasmVector);
    check('packaged native ↔ wasm parity', parity >= 0.995, `cosine ${parity.toFixed(6)}`);

    results.nativeLoadMs = +nativeLoadMs.toFixed(0);
    results.wasmLoadMs = +wasmLoadMs.toFixed(0);
    results.parity = +parity.toFixed(6);

    await nativeSession.release?.();
    await wasmSession.release?.();
  } catch (err) {
    results.ok = false;
    results.error = String(err?.stack ?? err);
  }

  for (const item of results.checks) console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`);
  console.log(`\nunpacked ONNX assets: ${results.unpackedAssetsMb} MB (${results.assets?.map((a) => `${a.file} ${a.mb} MB`).join(', ') ?? 'n/a'})`);
  if (results.error) console.error(results.error);
  console.log(results.ok ? '\nPACKAGED CHECK: GO' : '\nPACKAGED CHECK: NO-GO');

  fs.mkdirSync(path.join(process.cwd(), 'test/spike-embedding/results'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'test/spike-embedding/results/packaged.json'),
    JSON.stringify(results, null, 2) + '\n',
    'utf-8',
  );
  app.exit(results.ok ? 0 : 1);
});
