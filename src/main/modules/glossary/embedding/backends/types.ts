// Inference backend contract for the local embedding model (design §2.5.6.8 /
// P2b-2).
//
// Two implementations share the same interface so the tokenizer, pooling and
// normalization code is identical and both backends produce (near) identical
// vectors:
//
//   NativeBackend — `onnxruntime-node` (N-API native module, ships with the app)
//   WasmBackend   — `onnxruntime-web` (WASM compatibility mode, no native DLLs)
//
// The vendor types are intentionally kept out of this file: the embedder only
// sees generic tensors, which keeps unit tests and the renderer bundle free of
// onnxruntime imports.

/** Output of one inference call. */
export interface BackendRunResult {
  /** Flattened `last_hidden_state` values, length = batch × seqLen × dims. */
  data: Float32Array;
  /** `[batch, seqLen, dims]`. */
  dims: [number, number, number];
}

/** A loaded ONNX inference session. */
export interface BackendSession {
  /** Input names accepted by the model (e.g. `input_ids`, `attention_mask`). */
  readonly inputNames: string[];
  /** Run one batch; all tensors are `BigInt64Array` int64 of shape `[batch, seq]`. */
  run(
    inputIds: BigInt64Array,
    attentionMask: BigInt64Array,
    tokenTypeIds: BigInt64Array,
    shape: [number, number]
  ): Promise<BackendRunResult>;
  /** Release the session (and any WASM memory) when done. */
  release(): Promise<void>;
}

export interface BackendLoadOptions {
  /** Thread hint passed to the runtime (`min(4, cpus/2)` by default). */
  threads: number;
  /** Directory holding `ort-wasm-simd-threaded.wasm` (WASM backend only). */
  wasmDir?: string;
}

/** One runtime backend (`native` or `wasm`). */
export interface InferenceBackend {
  readonly kind: 'native' | 'wasm';
  load(modelPath: string, options: BackendLoadOptions): Promise<BackendSession>;
}

/** Error codes surfaced to the model state machine (design §2.5.6.6). */
export type ModelFailureReason =
  | 'network'
  | 'timeout'
  | 'checksum'
  | 'unzip'
  | 'disk_full'
  | 'runtime_load'
  | 'inference'
  | 'incompatible'
  | 'user_cancel';

/** Error carrying a machine-readable failure reason. */
export class ModelError extends Error {
  constructor(
    readonly reason: ModelFailureReason,
    message: string
  ) {
    super(message);
    this.name = 'ModelError';
  }
}
