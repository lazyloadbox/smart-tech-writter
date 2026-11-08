// Local ONNX embedder (design §2.5.6.2–2.5.6.4 / §2.5.6.8 / P2b-2).
//
// Hides whether inference runs on the native or the WASM backend: the
// tokenizer, mean pooling and L2 normalization are shared, so both backends
// produce (near) identical vectors and switching backends never requires
// rebuilding the index (P0-5: min cosine 0.9986, candidate interchange ≥ 98 %).

import fs from 'node:fs';
import path from 'node:path';
import { NativeBackend } from './backends/native-backend';
import { WasmBackend } from './backends/wasm-backend';
import { ModelError, type BackendSession, type InferenceBackend } from './backends/types';
import { XlmrTokenizer } from './tokenizer';
import type { GlossaryRuntimeBackend } from '../../../../shared/types/glossary.types';

/** Preferred model file names, in order. */
export const MODEL_FILE_CANDIDATES = ['model_quantized.onnx', 'model_fp16.onnx', 'model.onnx'] as const;
/** Files that must exist next to the weights. */
export const REQUIRED_MODEL_FILES = ['tokenizer.json', 'config.json'] as const;

export type EmbeddingKind = 'query' | 'passage';

export interface LocalEmbedderOptions {
  modelDir: string;
  /** `auto` prefers native and silently falls back to WASM (design §2.5.6.8). */
  runtimeBackend: GlossaryRuntimeBackend;
  /** Skip the native attempt first (a recent native load failure is cached). */
  preferWasm?: boolean;
  threads?: number;
  maxTokens?: number;
  /** Directory holding `ort-wasm-simd-threaded.wasm`; resolved automatically when omitted. */
  wasmDir?: string;
}

export interface LocalEmbedder {
  readonly backend: 'native' | 'wasm';
  /** Populated when `auto` fell back to the WASM backend. */
  readonly nativeError?: string;
  readonly dims: number;
  /** `passage: ` / `query: ` prefixes required by the e5 model family. */
  embed(texts: string[], kind: EmbeddingKind): Promise<Float32Array[]>;
  /** Dimension / finiteness / norm sanity check for the freshly loaded model. */
  selfTest(): Promise<void>;
  dispose(): Promise<void>;
}

/** Locate the ONNX weights inside a model directory. */
export function findModelFile(modelDir: string): string {
  for (const candidate of MODEL_FILE_CANDIDATES) {
    const full = path.join(modelDir, candidate);
    if (fs.existsSync(full)) return full;
  }
  throw new ModelError(
    'incompatible',
    `no ONNX model found in ${modelDir} (looked for ${MODEL_FILE_CANDIDATES.join(', ')})`
  );
}

function defaultThreads(): number {
  const cpus = typeof navigator !== 'undefined' ? 4 : 4;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('node:os') as typeof import('node:os');
    return Math.max(1, Math.min(4, Math.floor((os.cpus()?.length ?? cpus) / 2)));
  } catch {
    return 2;
  }
}

/** Mean pooling over the attention mask + L2 normalization. */
function poolAndNormalize(
  data: Float32Array,
  dims: [number, number, number],
  lengths: number[]
): Float32Array[] {
  const [batch, seqLen, hidden] = dims;
  const vectors: Float32Array[] = [];
  for (let row = 0; row < batch; row++) {
    const sum = new Float32Array(hidden);
    const rows = Math.max(1, Math.min(seqLen, lengths[row] ?? seqLen));
    for (let col = 0; col < rows; col++) {
      const base = (row * seqLen + col) * hidden;
      for (let d = 0; d < hidden; d++) sum[d] += data[base + d];
    }
    let norm = 0;
    for (let d = 0; d < hidden; d++) {
      sum[d] /= rows;
      norm += sum[d] * sum[d];
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < hidden; d++) sum[d] /= norm;
    vectors.push(sum);
  }
  return vectors;
}

interface LoadedEmbedder {
  backend: 'native' | 'wasm';
  nativeError?: string;
  session: BackendSession;
  tokenizer: XlmrTokenizer;
  maxTokens: number;
}

async function loadWith(
  backend: InferenceBackend,
  modelPath: string,
  modelDir: string,
  options: LocalEmbedderOptions
): Promise<LoadedEmbedder> {
  const tokenizer = XlmrTokenizer.fromModelDir(modelDir);
  const session = await backend.load(modelPath, {
    threads: options.threads ?? defaultThreads(),
    wasmDir: options.wasmDir,
  });
  return {
    backend: backend.kind,
    session,
    tokenizer,
    maxTokens: options.maxTokens ?? 64,
  };
}

/**
 * Create an embedder, applying the backend selection policy:
 *   - `wasm`   → always the compatibility backend
 *   - `native` → native only, failures propagate
 *   - `auto`   → native first, silently fall back to WASM and report the reason
 */
export async function createLocalEmbedder(options: LocalEmbedderOptions): Promise<LocalEmbedder> {
  const modelPath = findModelFile(options.modelDir);
  let loaded: LoadedEmbedder;

  const ignoreNative = options.runtimeBackend === 'wasm' || (options.runtimeBackend === 'auto' && options.preferWasm);
  if (ignoreNative) {
    loaded = await loadWith(new WasmBackend(), modelPath, options.modelDir, options);
  } else {
    try {
      loaded = await loadWith(new NativeBackend(), modelPath, options.modelDir, options);
    } catch (err) {
      if (options.runtimeBackend === 'native') throw err;
      const nativeError = err instanceof Error ? err.message : String(err);
      const wasm = await loadWith(new WasmBackend(), modelPath, options.modelDir, options);
      loaded = { ...wasm, nativeError };
    }
  }

  const expectedDims = readExpectedDims(options.modelDir);

  const embedder: LocalEmbedder = {
    backend: loaded.backend,
    nativeError: loaded.nativeError,
    dims: expectedDims,
    async embed(texts, kind) {
      if (texts.length === 0) return [];
      const prefix = kind === 'query' ? 'query: ' : 'passage: ';
      const encodings = texts.map((text) =>
        loaded.tokenizer.encode(prefix + text, { maxLength: loaded.maxTokens, addSpecialTokens: true })
      );
      const batch = encodings.length;
      const seqLen = Math.max(...encodings.map((enc) => enc.inputIds.length));
      const total = batch * seqLen;

      const inputIds = new BigInt64Array(total);
      const attentionMask = new BigInt64Array(total);
      const tokenTypeIds = new BigInt64Array(total);
      encodings.forEach((enc, row) => {
        for (let col = 0; col < enc.inputIds.length; col++) {
          const at = row * seqLen + col;
          inputIds[at] = BigInt(enc.inputIds[col]);
          attentionMask[at] = 1n;
          tokenTypeIds[at] = 0n;
        }
      });

      let result;
      try {
        result = await loaded.session.run(inputIds, attentionMask, tokenTypeIds, [batch, seqLen]);
      } catch (err) {
        throw new ModelError(
          'inference',
          `embedding inference failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      const [batchDim, seqDim, hiddenDim] = result.dims;
      if (hiddenDim && expectedDims && hiddenDim !== expectedDims) {
        throw new ModelError(
          'incompatible',
          `model produced ${hiddenDim}-dim vectors but ${expectedDims} were expected`
        );
      }
      return poolAndNormalize(result.data, [batchDim, seqDim, hiddenDim], encodings.map((e) => e.inputIds.length));
    },
    async selfTest() {
      const [vector] = await embedder.embed(['duty cycle'], 'query');
      if (!vector || vector.length === 0) throw new ModelError('inference', 'self-test produced no vector');
      if (expectedDims && vector.length !== expectedDims) {
        throw new ModelError('incompatible', `self-test dims ${vector.length} != ${expectedDims}`);
      }
      let norm = 0;
      for (const value of vector) {
        if (!Number.isFinite(value)) throw new ModelError('inference', 'self-test produced non-finite values');
        norm += value * value;
      }
      if (Math.abs(Math.sqrt(norm) - 1) > 0.01) {
        throw new ModelError('inference', 'self-test vector is not normalized');
      }
    },
    async dispose() {
      await loaded.session.release().catch((): void => undefined);
    },
  };
  return embedder;
}

/** Read `hidden_size` from `config.json`; 384 when unavailable. */
function readExpectedDims(modelDir: string): number {
  try {
    const raw = fs.readFileSync(path.join(modelDir, 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { hidden_size?: number; d_model?: number; dims?: number };
    const dims = parsed.hidden_size ?? parsed.d_model ?? parsed.dims;
    return typeof dims === 'number' && dims > 0 ? dims : 384;
  } catch {
    return 384;
  }
}

/** Float32Array → Buffer for SQLite BLOB storage. */
export function vectorToBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

/** SQLite BLOB → Float32Array (copies, so the buffer can be freed). */
export function blobToVector(blob: Buffer): Float32Array {
  const copy = new Float32Array(blob.byteLength / 4);
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  for (let i = 0; i < copy.length; i++) copy[i] = view.getFloat32(i * 4, true);
  return copy;
}
