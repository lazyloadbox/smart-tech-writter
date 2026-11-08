// WASM compatibility backend (`onnxruntime-web`) — design §2.5.6.8 / P2b-2.
//
// Used when the native module cannot be loaded (missing VC++ runtime, AV
// blocking the DLL, unsigned-module policy) or when the user explicitly picks
// `runtimeBackend = 'wasm'`.
//
// Notes from the P0-5 spike:
//   - Electron's ESM loader cannot read modules inside app.asar, so the WASM
//     runtime must be loaded through the CommonJS entry (a static import is
//     compiled to `require()` by the CJS main build).
//   - `ort.env.wasm.wasmPaths` needs a `file://` URL on Windows; a bare
//     `D:\...` path is rejected by the loader.
//   - `numThreads = 1` keeps WASM memory around 648 MB instead of 813 MB, so
//     compatibility mode is rate-limited by design.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireOptional, type OrtModule, type OrtSession, type OrtTensor } from './require-optional';
import { ModelError, type BackendLoadOptions, type BackendRunResult, type BackendSession, type InferenceBackend } from './types';

/** Rewrite a path inside `app.asar` to its unpacked twin when it exists. */
function preferUnpacked(target: string): string {
  const marker = `${path.sep}app.asar${path.sep}`;
  if (!target.includes(marker)) return target;
  const unpacked = target.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`);
  return fs.existsSync(unpacked) ? unpacked : target;
}

/**
 * Locate the directory that holds `ort-wasm-simd-threaded.{wasm,mjs}`.
 * Resolved from the installed package so dev and packaged builds both work.
 */
export function resolveWasmDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkgPath = require.resolve('onnxruntime-web/package.json');
    return preferUnpacked(path.join(path.dirname(pkgPath), 'dist'));
  } catch {
    return preferUnpacked(path.resolve(process.cwd(), 'node_modules/onnxruntime-web/dist'));
  }
}

export class WasmBackend implements InferenceBackend {
  readonly kind = 'wasm' as const;

  async load(modelPath: string, options: BackendLoadOptions): Promise<BackendSession> {
    const wasmDir = options.wasmDir ?? resolveWasmDir();
    let ort: OrtModule;
    try {
      ort = requireOptional<OrtModule>('onnxruntime-web');
    } catch (err) {
      throw new ModelError(
        'runtime_load',
        `onnxruntime-web could not be loaded: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    try {
      if (ort.env?.wasm) {
        ort.env.wasm.numThreads = Math.max(1, Math.min(4, options.threads));
        ort.env.wasm.simd = true;
        ort.env.wasm.wasmPaths = pathToFileURL(path.resolve(wasmDir) + path.sep).href;
      }
    } catch (err) {
      throw new ModelError(
        'runtime_load',
        `onnxruntime-web environment setup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let session: OrtSession;
    try {
      session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } catch (err) {
      // Multi-threaded WASM can fail to initialise without SharedArrayBuffer.
      try {
        if (ort.env?.wasm) ort.env.wasm.numThreads = 1;
        session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
      } catch {
        throw new ModelError(
          'runtime_load',
          `onnxruntime-web failed to load: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const inputNames = session.inputNames;
    return {
      inputNames,
      async run(inputIds, attentionMask, tokenTypeIds, shape): Promise<BackendRunResult> {
        const feeds: Record<string, unknown> = {};
        if (inputNames.includes('input_ids')) feeds.input_ids = new ort.Tensor('int64', inputIds, shape);
        if (inputNames.includes('attention_mask')) feeds.attention_mask = new ort.Tensor('int64', attentionMask, shape);
        if (inputNames.includes('token_type_ids')) feeds.token_type_ids = new ort.Tensor('int64', tokenTypeIds, shape);

        const outputs = await session.run(feeds);
        const hidden = (outputs.last_hidden_state ??
          outputs[session.outputNames[0]]) as OrtTensor | undefined;
        if (!hidden) throw new ModelError('inference', 'model produced no hidden state output');
        const [batch, seq, hiddenDims] = hidden.dims;
        return { data: hidden.data as Float32Array, dims: [batch ?? 0, seq ?? 0, hiddenDims ?? 0] };
      },
      async release(): Promise<void> {
        await session.release?.();
      },
    };
  }
}
