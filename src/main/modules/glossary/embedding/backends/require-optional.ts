// Lazy `require()` for optional native/ESM runtimes (P2b-2).
//
// `onnxruntime-node` fails at *module load* when the native binding cannot be
// resolved (missing VCRUNTIME140.dll, AV blocking the DLL, unsigned module
// policy). A static `import` would therefore take the whole main process down
// during start-up, which violates the "semantic layer is optional" rule
// (design §2.5.6.7).
//
// The main bundle is CommonJS, so `require` exists at runtime; resolving the
// module lazily inside the backend's `load()` keeps import-time side effects
// out of the app bootstrap.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires

/* eslint-disable @typescript-eslint/no-explicit-any */

declare const require: NodeRequire | undefined;

export function requireOptional<T>(id: string): T {
  if (typeof require !== 'function') {
    throw new Error(`cannot load "${id}": require() is not available in this runtime`);
  }
  return require(id) as T;
}

/** Minimal ORT tensor shape we rely on. */
export interface OrtTensor {
  data: Float32Array | BigInt64Array;
  dims: number[];
}

/** Minimal ORT session surface we rely on. */
export interface OrtSession {
  readonly inputNames: string[];
  readonly outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
  release?(): Promise<void>;
}

/** Minimal `onnxruntime-node` / `onnxruntime-web` module surface. */
export interface OrtModule {
  InferenceSession: {
    create(path: string, options?: Record<string, unknown>): Promise<OrtSession>;
  };
  Tensor: new (type: 'int64' | 'float32', data: BigInt64Array | Float32Array, dims: number[]) => unknown;
  env?: {
    wasm?: {
      numThreads?: number;
      simd?: boolean;
      wasmPaths?: string;
    };
  };
}
