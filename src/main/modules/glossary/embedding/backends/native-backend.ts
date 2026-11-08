// Native inference backend (`onnxruntime-node`) — design §2.5.6.8 / P2b-2.
//
// `onnxruntime-node` is a N-API native module; it is externalized in the Vite
// main build and unpacked from app.asar at package time (forge.config.ts).
// Loading can fail on locked-down machines (missing VCRUNTIME140.dll, DLL
// blocked by AV, unsigned module policy) — callers catch that and switch to the
// WASM compatibility backend.

import { requireOptional, type OrtModule, type OrtSession, type OrtTensor } from './require-optional';
import { ModelError, type BackendLoadOptions, type BackendRunResult, type BackendSession, type InferenceBackend } from './types';

export class NativeBackend implements InferenceBackend {
  readonly kind = 'native' as const;

  async load(modelPath: string, options: BackendLoadOptions): Promise<BackendSession> {
    let ort: OrtModule;
    try {
      ort = requireOptional<OrtModule>('onnxruntime-node');
    } catch (err) {
      throw new ModelError(
        'runtime_load',
        `onnxruntime-node could not be loaded: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let session: OrtSession;
    try {
      session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: Math.max(1, options.threads),
        interOpNumThreads: 1,
      });
    } catch (err) {
      throw new ModelError(
        'runtime_load',
        `onnxruntime-node failed to create a session: ${err instanceof Error ? err.message : String(err)}`
      );
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
