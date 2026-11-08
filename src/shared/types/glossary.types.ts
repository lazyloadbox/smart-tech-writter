// Shared types for the glossary matching engine (design doc §2.5 / P2a).
//
// These types are used by both the main process (resolver / index / IPC) and
// the renderer (settings panel, match playground). They intentionally contain
// no Electron or Node imports so they can be imported from anywhere.

import type { GlossaryEntryKind } from './mapping.types';
import type { GlossaryTermCandidate } from './document.types';

/** Where glossary matching happens; drives the injected tone and direction. */
export type GlossaryMatchScenario = 'writing' | 'translation' | 'review';

/** Confidence tier of one resolved glossary hit. */
export type GlossaryTier = 'A' | 'B';

/**
 * Evidence layer that produced a hit:
 * - `exact`   L1 — literal occurrence
 * - `variant` L2 — case / hyphen / plural / fullwidth differences
 * - `alias`   L2 — abbreviation or alternative spelling
 * - `fuzzy`   L3 — sentence-level translation-memory match
 * - `semantic` L4 — local embeddings (P2b, not enabled yet)
 * - `ai`      L5 — AI candidate extraction / adjudication (P2c)
 */
export type GlossaryLayer = 'exact' | 'variant' | 'alias' | 'fuzzy' | 'semantic' | 'ai';

/** One resolved glossary entry for a piece of text (design §2.5.8). */
export interface GlossaryHit {
  entryId: string;
  tier: GlossaryTier;
  score: number;
  layers: GlossaryLayer[];
  /** Number of occurrences found in the text. */
  hits: number;
  /** Up to two source snippets, used for review/UI display. */
  samples: { surface: string; context: string }[];
  /** Human decision from the review panel (P3). */
  userState?: 'confirmed' | 'removed' | 'added';
}

/** Counts per layer, for the workflow log line (design §2.5.13). */
export type GlossaryLayerCounts = Record<GlossaryLayer, number>;

/** Result of resolving source material for document generation (L1–L5). */
export interface GlossaryWritingResolveResult extends GlossaryResolveResult {
  /** Concepts fed into the engine (from FileParser, or extracted by L5a). */
  candidates: GlossaryTermCandidate[];
  /** `true` when the semantic layer contributed evidence. */
  semanticUsed: boolean;
  /** Grazing candidates that were escalated to L5b adjudication. */
  grayCount: number;
}

/** Result of resolving a text against the glossary. */
export interface GlossaryResolveResult {
  hits: GlossaryHit[];
  matchCount: number;
  /** Number of distinct entries that matched before tier filtering. */
  candidateCount: number;
  layers: GlossaryLayerCounts;
  elapsedMs: number;
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Minimum shape needed to render a prompt block (mirrors `TranslationMapping`). */
export interface GlossaryEntryView {
  id: string;
  en: string;
  zhCN: string;
  zhTW: string;
  kind: GlossaryEntryKind;
  specificity: number;
  /** Forbidden / deprecated wordings (P4-6 "Do not use" column). */
  doNotUse?: string[];
}

export type GlossaryRuntimeBackend = 'auto' | 'native' | 'wasm';
export type GlossaryAdjudicationMode = 'off' | 'grayOnly' | 'all';

/** Persisted at `settings['glossary.settings']` (design §2.9). */
export interface GlossarySettings {
  /** Master switch. */
  enabled: boolean;
  useInWriter: boolean;
  useInTranslation: boolean;
  useInReview: boolean;
  /** Deterministic rule layer (P3). */
  ruleCheck: boolean;
  /** Entry count at or below which the whole table is injected. */
  fullInjectThreshold: number;
  /** Prompt token budgets per stage. */
  budget: { writer: number; translateChunk: number; reviewChunk: number };
  /** Model context window, used to cap the glossary budget. */
  modelContextTokens: number;
  /** Character thresholds above which large documents are chunked. */
  chunkThresholdChars: { translate: number; review: number };
  /** Enabled matching layers. */
  layers: { variant: boolean; fuzzy: boolean; semantic: boolean; spellcheck: boolean };
  /** Tier + layer thresholds (semantic values need evaluation data, P2b). */
  thresholds: {
    tierA: number;
    tierB: number;
    fuzzy: number;
    semanticCandidate: number;
    semanticGray: number;
  };
  /** Derive zh-TW aliases from zh-CN when zh_tw is empty. */
  convertZhTwFromZhCn: boolean;
  /** L5a candidate extraction (P2c). */
  aiCandidateExtraction: boolean;
  /** L5b gray-zone adjudication (P2c). */
  aiAdjudication: GlossaryAdjudicationMode;
  /** Post-translation targeted terminology fix (P3). */
  autoFixTerminology: boolean;
  /** P4-3: inject the matched terminology into the analysis prompt too. */
  analyzeInjection: boolean;
  /** P4-6: deterministic "do not use" (forbidden wording) review check. */
  forbiddenCheck: boolean;
  /** P4-7: persist the vector index snapshot under `userData/cache`. */
  vectorSnapshot: boolean;
  /** P4-8: let the writer query the glossary through a tool call. Default off. */
  writerToolLookup: boolean;
  /** Local ONNX embedding layer (P2b). */
  localEmbedding: {
    enabled: boolean;
    modelId: string;
    downloadSources: string[];
    runtimeBackend: GlossaryRuntimeBackend;
    idleUnloadSec: number;
  };
}

/** Default glossary settings (design §2.9). */
export const DEFAULT_GLOSSARY_SETTINGS: GlossarySettings = {
  enabled: true,
  useInWriter: true,
  useInTranslation: true,
  useInReview: true,
  ruleCheck: true,
  fullInjectThreshold: 150,
  budget: { writer: 6000, translateChunk: 4000, reviewChunk: 3000 },
  modelContextTokens: 128000,
  chunkThresholdChars: { translate: 30000, review: 20000 },
  layers: { variant: true, fuzzy: true, semantic: true, spellcheck: false },
  thresholds: {
    tierA: 0.92,
    tierB: 0.8,
    fuzzy: 0.75,
    semanticCandidate: 0.88,
    semanticGray: 0.84,
  },
  convertZhTwFromZhCn: true,
  aiCandidateExtraction: true,
  aiAdjudication: 'grayOnly',
  autoFixTerminology: false,
  analyzeInjection: true,
  forbiddenCheck: true,
  vectorSnapshot: true,
  writerToolLookup: false,
  localEmbedding: {
    enabled: false,
    modelId: 'multilingual-e5-small-int8',
    downloadSources: ['https://huggingface.co/Xenova/multilingual-e5-small/resolve/main'],
    runtimeBackend: 'auto',
    idleUnloadSec: 300,
  },
};

/**
 * Merge persisted (possibly partial / legacy) settings with the defaults.
 * Nested objects are merged so a settings JSON written by an older version
 * keeps working.
 */
export function mergeGlossarySettings(
  stored: Partial<GlossarySettings> | null | undefined
): GlossarySettings {
  const base = DEFAULT_GLOSSARY_SETTINGS;
  if (!stored || typeof stored !== 'object') return cloneSettings(base);
  return {
    ...base,
    ...stored,
    budget: { ...base.budget, ...(stored.budget ?? {}) },
    chunkThresholdChars: { ...base.chunkThresholdChars, ...(stored.chunkThresholdChars ?? {}) },
    layers: { ...base.layers, ...(stored.layers ?? {}) },
    thresholds: { ...base.thresholds, ...(stored.thresholds ?? {}) },
    localEmbedding: { ...base.localEmbedding, ...(stored.localEmbedding ?? {}) },
  };
}

function cloneSettings(settings: GlossarySettings): GlossarySettings {
  return JSON.parse(JSON.stringify(settings)) as GlossarySettings;
}

// ── Index status / match playground ─────────────────────────────────────────

export type GlossaryModelState =
  | 'absent'
  | 'downloading'
  | 'installing'
  | 'verifying'
  | 'ready'
  | 'degraded'
  | 'failed';

/** Failure reasons surfaced by the model state machine (design §2.5.6.6). */
export type GlossaryModelFailureReason =
  | 'network'
  | 'timeout'
  | 'checksum'
  | 'unzip'
  | 'disk_full'
  | 'runtime_load'
  | 'inference'
  | 'incompatible'
  | 'user_cancel';

/** Progress event for downloads / installs (`glossary:modelProgress`). */
export interface GlossaryModelProgress {
  phase: 'download' | 'unzip' | 'verify' | 'test';
  file?: string;
  receivedBytes?: number;
  totalBytes?: number;
}

/** Model card status (design §2.11.3). */
export interface GlossaryModelStatus {
  state: GlossaryModelState;
  reason?: string;
  /** Failure reason code (when `state` is `failed`/`degraded`). */
  reasonCode?: GlossaryModelFailureReason;
  source?: string;
  revision?: string;
  backend: 'native' | 'wasm' | null;
  custom: boolean;
  /** `installed.json` exists and every file has the recorded size. */
  installed: boolean;
  modelId: string;
  dims?: number;
  installedAt?: string;
  /** `true` when the WASM compatibility backend is in use. */
  compatibility: boolean;
  /** Timestamp of the last cached native load failure (design §2.5.6.8). */
  nativeFailedAt?: string;
  progress?: GlossaryModelProgress;
}

/** Background vector indexing progress (`glossary:embeddingProgress`). */
export interface GlossaryEmbeddingProgress {
  done: number;
  total: number;
  failed: number;
  running: boolean;
}

/** Renderer-facing result of an install / confirm action. */
export type GlossaryModelInstallOutcome =
  | { status: 'installed'; modelId: string; backend: 'native' | 'wasm'; custom: boolean }
  | { status: 'needs_confirm'; modelId: string; files: string[]; reason: string }
  | { status: 'cancelled' };

// ── L5b gray-zone adjudication ──────────────────────────────────────────────

/** One candidate entry offered to the adjudicator. */
export interface GlossaryAdjudicationOption {
  entryId: string;
  en: string;
  zhCN: string;
  score: number;
}

/** One gray-zone candidate sent for adjudication. */
export interface GlossaryAdjudicationCandidate {
  candidateId: string;
  /** The surface string found in the source text. */
  surface: string;
  /** ≤ 200 characters of surrounding context. */
  context?: string;
  /** Up to 3 plausible glossary entries. */
  options: GlossaryAdjudicationOption[];
}

/** Adjudicator verdict for one candidate. */
export interface GlossaryAdjudicationResult {
  candidateId: string;
  /** Accepted entry, or `null` when the candidate does not match any option. */
  entryId: string | null;
  /** 0–1 confidence in the verdict. */
  confidence: number;
  reason?: string;
}

/** Status returned by `glossary:indexStatus` (design §2.10). */
export interface GlossaryIndexStatus {
  /** `settings['glossary.version']` the cached index was built from. */
  version: number;
  /** Number of glossary entries in the index. */
  entries: number;
  indexReady: boolean;
  /** Canonical engine description (`l1-l3` until P2b adds embeddings). */
  engine: 'l1-l3' | 'l1-l4';
  /** Whether matching runs in a worker thread or fell back to in-process. */
  worker: 'worker' | 'inline';
  model: GlossaryModelStatus;
  embedded: number;
  embeddingTotal: number;
  embeddingRunning: boolean;
}

/** Payload for the settings-page "matching playground". */
export interface GlossaryTestMatchPayload {
  text: string;
  scenario?: GlossaryMatchScenario;
  /** Target language for translation scenarios (defaults to zh-CN). */
  targetLang?: 'en' | 'zh-CN' | 'zh-TW';
}

/** Result of one playground run. */
export interface GlossaryTestMatchResult {
  hits: GlossaryHit[];
  /** Entry details for every returned hit (id → entry). */
  entries: Record<string, GlossaryEntryView>;
  /** Rendered prompt block (compact TSV). */
  block: string;
  tokens: number;
  truncated: number;
  layers: GlossaryLayerCounts;
  elapsedMs: number;
  /** Number of glossary entries the index holds. */
  entryCount: number;
}

// ── Usage report (P4-4) ─────────────────────────────────────────────────────

/** How one glossary entry fares in the final document. */
export type GlossaryUsageStatus = 'used' | 'variant' | 'missing';

/** One row of the pre-export terminology usage report. */
export interface GlossaryUsageRow {
  entryId: string;
  en: string;
  zhCN: string;
  /** Tier from the current run (null when the entry was added manually). */
  tier: GlossaryTier | null;
  status: GlossaryUsageStatus;
  /** Number of approved-wording occurrences. */
  occurrences: number;
  /** Surface variants found (case / hyphen / spacing). */
  variants: string[];
  /** Forbidden wordings found in the document (P4-6). */
  forbidden: string[];
}

/** Result of `glossary:usageReport`. */
export interface GlossaryUsageReport {
  /** Entries evaluated (the run's hits plus manual additions). */
  total: number;
  /** Entries whose approved wording is used verbatim. */
  used: number;
  /** Entries present only through a surface variant. */
  variantOnly: number;
  /** Entries not found at all. */
  missing: number;
  /** Entries whose forbidden wording was found. */
  forbidden: number;
  /** Character count of the analysed text. */
  checkedChars: number;
  rows: GlossaryUsageRow[];
}

/** Payload for `glossary:usageReport`. */
export interface GlossaryUsageReportPayload {
  /** Final document text (DITA XML or Markdown). */
  text: string;
  /** Hits confirmed in this run (usually `DocGenState.glossaryHits`). */
  hits?: GlossaryHit[];
}

