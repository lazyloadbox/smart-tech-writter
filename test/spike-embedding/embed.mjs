// P0-5 spike: minimal embedder with swappable ONNX backends.
//
// Mirrors the runtime design (§2.5.6.3 / §2.5.6.8): one `Embedder` that hides
// whether inference runs on `onnxruntime-node` (native) or `onnxruntime-web`
// (WASM compatibility mode). Tokenizer, mean pooling and L2 normalization are
// shared so both backends must produce (near) identical vectors.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { XlmrTokenizer } from './tokenizer.mjs';

const require = createRequire(import.meta.url);

export const MODEL_FILES = ['tokenizer.json', 'config.json'];
export const MODEL_FILE_CANDIDATES = ['model_quantized.onnx', 'model_fp16.onnx', 'model.onnx'];

/** Locate the ONNX weights inside a model directory. */
export function findModelFile(modelDir) {
  for (const candidate of MODEL_FILE_CANDIDATES) {
    const full = path.join(modelDir, candidate);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(`no ONNX model found in ${modelDir} (looked for ${MODEL_FILE_CANDIDATES.join(', ')})`);
}

export function modelDirFromArg() {
  return path.resolve(process.cwd(), process.argv[2] ?? 'test/spike-embedding/models/multilingual-e5-small-int8');
}

/** Fast integrity check: files exist and match the sizes recorded at install time. */
export function checkModelFiles(modelDir) {
  const result = { modelDir, ok: true, problems: [], files: {} };
  const installedPath = path.join(modelDir, 'installed.json');
  let installed = null;
  if (fs.existsSync(installedPath)) {
    try {
      installed = JSON.parse(fs.readFileSync(installedPath, 'utf-8'));
    } catch (err) {
      result.ok = false;
      result.problems.push(`installed.json is not valid JSON: ${err.message}`);
    }
  } else {
    result.ok = false;
    result.problems.push('installed.json is missing');
  }

  for (const file of MODEL_FILES) {
    const full = path.join(modelDir, file);
    if (!fs.existsSync(full)) {
      result.ok = false;
      result.problems.push(`${file} is missing`);
      continue;
    }
    const size = fs.statSync(full).size;
    result.files[file] = size;
    const expected = installed?.files?.[file]?.size;
    if (expected !== undefined && expected !== size) {
      result.ok = false;
      result.problems.push(`${file}: size ${size} does not match installed.json (${expected})`);
    }
  }

  const modelFile = MODEL_FILE_CANDIDATES.find((candidate) => fs.existsSync(path.join(modelDir, candidate)));
  if (!modelFile) {
    result.ok = false;
    result.problems.push(`no ONNX model file (${MODEL_FILE_CANDIDATES.join(', ')})`);
  } else {
    const full = path.join(modelDir, modelFile);
    const size = fs.statSync(full).size;
    result.files[modelFile] = size;
    const expected = installed?.files?.[modelFile]?.size;
    if (expected !== undefined && expected !== size) {
      result.ok = false;
      result.problems.push(`${modelFile}: size ${size} does not match installed.json (${expected})`);
    }
  }
  return result;
}

async function loadNativeBackend({ modelPath, threads }) {
  const ort = require('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    intraOpNumThreads: threads,
    interOpNumThreads: 1,
  });
  return { ort, session, backend: 'native' };
}

async function loadWasmBackend({ modelPath, threads, wasmDir }) {
  // CommonJS first: Electron's ESM loader cannot read modules inside app.asar,
  // so the production worker must load onnxruntime-web through require().
  let ort;
  try {
    ort = require('onnxruntime-web');
  } catch {
    ort = await import('onnxruntime-web');
  }
  const { pathToFileURL } = await import('node:url');
  ort.env.wasm.numThreads = threads;
  ort.env.wasm.simd = true;
  // ORT web resolves its runtime module/wasm through an ESM import, which needs a
  // file:// URL on Windows (a bare `D:\...` path is rejected by the loader).
  const base = pathToFileURL(path.resolve(wasmDir) + path.sep).href;
  ort.env.wasm.wasmPaths = base;
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return { ort, session, backend: 'wasm' };
}

const toInt64 = (values) => BigInt64Array.from(values, (v) => BigInt(v));

/**
 * @param {object} options
 * @param {'native'|'wasm'} options.backend
 * @param {string} options.modelDir
 * @param {number} [options.threads]
 * @param {string} [options.wasmDir] directory that contains ort-wasm-simd-threaded.wasm
 */
export async function createEmbedder({ backend = 'native', modelDir, threads = 4, wasmDir, maxTokens = 64, simulateNativeFailure = false }) {
  if (backend === 'native' && simulateNativeFailure) {
    // Mirrors "onnxruntime-node failed to load" (missing VCRUNTIME140.dll, DLL blocked …).
    const error = new Error('simulated native runtime load failure: failed to load onnxruntime_binding.node');
    error.code = 'runtime_load';
    throw error;
  }
  const modelPath = findModelFile(modelDir);
  const tokenizer = XlmrTokenizer.fromModelDir(modelDir);
  const started = performance.now();
  const loaded = backend === 'native'
    ? await loadNativeBackend({ modelPath, threads })
    : await loadWasmBackend({ modelPath, threads, wasmDir });
  const loadMs = performance.now() - started;

  const inputNames = loaded.session.inputNames;
  const embedder = {
    backend: loaded.backend,
    loadMs,
    inputNames,
    tokenizer,
    async embed(texts, { kind = 'passage' } = {}) {
      const prefix = kind === 'query' ? 'query: ' : kind === 'passage' ? 'passage: ' : '';
      const encodings = texts.map((text) => tokenizer.encode(prefix + text, { maxLength: maxTokens, addSpecialTokens: true }));
      const batch = encodings.length;
      const seqLen = Math.max(...encodings.map((enc) => enc.inputIds.length));

      const inputIds = new BigInt64Array(batch * seqLen);
      const attentionMask = new BigInt64Array(batch * seqLen);
      const typeIds = new BigInt64Array(batch * seqLen);
      encodings.forEach((enc, row) => {
        for (let col = 0; col < enc.inputIds.length; col++) {
          const at = row * seqLen + col;
          inputIds[at] = BigInt(enc.inputIds[col]);
          attentionMask[at] = 1n;
          typeIds[at] = 0n;
        }
      });

      const feeds = {};
      if (inputNames.includes('input_ids')) feeds.input_ids = new loaded.ort.Tensor('int64', inputIds, [batch, seqLen]);
      if (inputNames.includes('attention_mask')) {
        feeds.attention_mask = new loaded.ort.Tensor('int64', attentionMask, [batch, seqLen]);
      }
      if (inputNames.includes('token_type_ids')) feeds.token_type_ids = new loaded.ort.Tensor('int64', typeIds, [batch, seqLen]);

      const outputs = await loaded.session.run(feeds);
      const hidden = outputs.last_hidden_state ?? outputs[loaded.session.outputNames[0]];
      const [, , dims] = hidden.dims;
      const data = hidden.data;

      const vectors = [];
      for (let row = 0; row < batch; row++) {
        const sum = new Float32Array(dims);
        let count = 0;
        const len = encodings[row].inputIds.length;
        for (let col = 0; col < len; col++) {
          if (attentionMask[row * seqLen + col] === 0n) continue;
          const base = (row * seqLen + col) * dims;
          for (let d = 0; d < dims; d++) sum[d] += data[base + d];
          count++;
        }
        let norm = 0;
        for (let d = 0; d < dims; d++) {
          sum[d] /= Math.max(1, count);
          norm += sum[d] * sum[d];
        }
        norm = Math.sqrt(norm) || 1;
        for (let d = 0; d < dims; d++) sum[d] /= norm;
        vectors.push(sum);
      }
      return { vectors, seqLen, batch, dims };
    },
    async dispose() {
      await loaded.session.release?.();
    },
  };
  return embedder;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function defaultWasmDir() {
  return path.resolve(process.cwd(), 'node_modules/onnxruntime-web/dist');
}

/**
 * Backend selection policy (design §2.5.6.8): `auto` prefers native and silently
 * falls back to the WASM compatibility backend, remembering the reason.
 */
export async function createEmbedderAuto(options) {
  const preference = options.backendPreference ?? 'auto';
  if (preference === 'wasm') {
    return { embedder: await createEmbedder({ ...options, backend: 'wasm' }), nativeError: null };
  }
  try {
    return { embedder: await createEmbedder({ ...options, backend: 'native' }), nativeError: null };
  } catch (err) {
    if (preference === 'native') throw err;
    const embedder = await createEmbedder({ ...options, backend: 'wasm' });
    return { embedder, nativeError: err instanceof Error ? err.message : String(err) };
  }
}
