// Built-in model allow-list (design §2.5.6.6 / P2b-1).
//
// The manifest is the single source of truth for:
//   - the expected file names and SHA-256 digests of the official model
//   - the vector dimensionality and max token budget
//   - the e5 `query:` / `passage:` prefixes
//
// Models that are not listed here can still be installed, but the user must
// explicitly confirm them as "custom" models and their thresholds need
// re-calibration (design §2.5.6.6).

import manifestJson from './model-manifest.json';

export interface ModelFileSpec {
  size: number;
  sha256: string;
}

export interface ModelSpec {
  displayName: string;
  revision: string;
  dims: number;
  maxTokens: number;
  approxSizeMb: number;
  prefix: { query: string; passage: string };
  files: Record<string, ModelFileSpec>;
  downloadSources: string[];
}

interface ModelManifest {
  format: number;
  defaultModelId: string;
  models: Record<string, ModelSpec>;
}

export const MODEL_MANIFEST = manifestJson as ModelManifest;

/** Default model id used when settings do not specify one. */
export const DEFAULT_MODEL_ID = MODEL_MANIFEST.defaultModelId;

/** Look up a built-in model spec; `undefined` for custom models. */
export function getModelSpec(modelId: string): ModelSpec | undefined {
  return MODEL_MANIFEST.models[modelId];
}

/** File names a valid model directory must contain (weights are optional here). */
export const MODEL_REQUIRED_FILES = ['tokenizer.json', 'config.json'] as const;

/** Accepted weight file names, in preference order. */
export const MODEL_WEIGHT_FILES = ['model_quantized.onnx', 'model_fp16.onnx', 'model.onnx'] as const;
