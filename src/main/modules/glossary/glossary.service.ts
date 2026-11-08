// Glossary matching service (design §2.5 / P2a-3 / P2a-5 / P2a-6).
//
// Owns the glossary settings, the cached index (worker + in-process mirror) and
// the high-level operations used by the rest of the app:
//
//   resolve()               raw hits for a text + scenario
//   buildTranslationContext() compact prompt block for a DITA file
//   testMatch()             settings-page playground
//   checkTranslation()      deterministic R3 self-check after translation
//
// Everything degrades gracefully: a missing glossary table, an unbuilt worker
// or an empty glossary simply produce an empty result.

import log from 'electron-log';
import { getDatabase, getSetting, setSetting, GLOSSARY_VERSION_KEY } from '../storage/database';
import { GlossaryWorkerClient } from './worker/client';
import type { GlossaryIndexRow, GlossaryMatch } from './index/glossary-index';
import { GlossaryIndex, preparePlainText, splitSentences } from './index/glossary-index';
import {
  emptyLayerCounts,
  formatResolveLog,
  fuseGlossaryMatches,
} from './resolver';
import { buildGlossaryPromptBlock, type GlossaryTargetLang } from './prompt-blocks';
import { glossaryBudgetFor } from './budget';
import {
  checkDraftTerms,
  checkForbiddenTerms,
  checkPhraseReuse,
  checkTranslationTerms,
  type TermIssue,
} from './checker';
import { buildUsageReport } from './usage-report';
import type { GlossaryAlias } from './aliases';
import { parseDoNotUse } from './normalize';
import { ModelManager } from './embedding/model-manager';
import { SemanticCapability } from './embedding/semantic-capability';
import { GlossaryEmbeddingJob, passageText } from './embedding-job';
import { TermExtractorAgent } from '../agents/term-extractor.agent';
import { GlossaryAdjudicatorAgent } from '../agents/glossary-adjudicator.agent';
import type { AIProvider } from '../ai-providers/base.provider';
import {
  mergeGlossarySettings,
  type GlossaryAdjudicationCandidate,
  type GlossaryEmbeddingProgress,
  type GlossaryEntryView,
  type GlossaryHit,
  type GlossaryIndexStatus,
  type GlossaryLayer,
  type GlossaryMatchScenario,
  type GlossaryModelProgress,
  type GlossaryResolveResult,
  type GlossarySettings,
  type GlossaryTestMatchPayload,
  type GlossaryTestMatchResult,
  type GlossaryUsageReport,
  type GlossaryWritingResolveResult,
} from '../../../shared/types/glossary.types';
import type { GlossaryTermCandidate, ReviewComment } from '../../../shared/types/document.types';
import type { PromptOverrides } from '../../../shared/types/prompts.types';
import type { GlossaryEntryKind } from '../../../shared/types/mapping.types';

/** Persisted settings key. */
export const GLOSSARY_SETTINGS_KEY = 'glossary.settings';

/** Above this many entries index builds/scans move into the worker thread. */
const WORKER_ENTRY_THRESHOLD = 5000;
/** Above this text length a translation scan also prefers the worker. */
const WORKER_TEXT_THRESHOLD = 100_000;
/** Changed entries tracked by the delta layer before a full rebuild. */
const DELTA_LIMIT = 200;

interface MappingRow {
  id: string;
  en: string;
  zh_cn: string;
  zh_tw: string;
  do_not_use?: string | null;
  kind: GlossaryEntryKind;
}

interface AliasRow {
  entry_id: string;
  lang: string;
  alias: string;
  alias_key: string;
  alias_kind: string;
}

interface TranslationContext {
  text: string;
  count: number;
  tokens: number;
  truncated: number;
  hits: GlossaryResolveResult['hits'];
  result: GlossaryResolveResult;
}

const EMPTY_RESULT: GlossaryResolveResult = {
  hits: [],
  matchCount: 0,
  candidateCount: 0,
  layers: emptyLayerCounts(),
  elapsedMs: 0,
};

/** Stable, dependency-free string hash (FNV-1a) for the LRU cache keys. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

interface ResolveOptions {
  targetLang?: GlossaryTargetLang;
  settings?: GlossarySettings;
  /** Provider enabling L5 gray-zone adjudication (and L5a extraction upstream). */
  provider?: AIProvider;
  signal?: AbortSignal;
  /** L5a candidates already extracted by the FileParser. */
  candidates?: GlossaryTermCandidate[];
  onProgress?: (message: string) => void;
  /** User-configured prompt overrides for the L5 helper agents. */
  promptOverrides?: PromptOverrides;
}

export class GlossaryService {
  private readonly client = new GlossaryWorkerClient();
  private settings: GlossarySettings;
  private builtVersion = -1;
  private rows: GlossaryIndexRow[] = [];
  private workerVersion = -1;
  /** Entries changed since the last full build (delta layer). */
  private readonly deltaIds = new Set<string>();
  private readonly deltaRemovedIds = new Set<string>();
  private deltaIndex: GlossaryIndex | null = null;
  private readonly cache = new Map<string, GlossaryResolveResult>();
  private static readonly CACHE_LIMIT = 64;

  /** Local embedding model lifecycle (P2b). */
  private readonly modelManager: ModelManager;
  /** Availability gate + circuit breaker for the semantic layer. */
  private readonly semantic: SemanticCapability;
  /** Background vector indexing job. */
  private readonly embeddingJob: GlossaryEmbeddingJob;
  private modelProgress: GlossaryModelProgress | null = null;

  constructor(settings?: Partial<GlossarySettings>) {
    this.settings = settings ? mergeGlossarySettings(settings) : this.loadSettings();
    this.modelManager = new ModelManager({
      getSettings: () => this.settings,
      onProgress: (progress) => {
        this.modelProgress = progress;
        this.progressListeners.model?.(progress);
      },
      onStateChange: () => this.progressListeners.modelState?.(),
      onModelInstalled: (modelId) => this.activateModel(modelId),
    });
    this.semantic = new SemanticCapability(this.modelManager, () => this.settings);
    this.embeddingJob = new GlossaryEmbeddingJob({
      getSettings: () => this.settings,
      getEmbedder: () => this.semantic.withSemanticFallback((e) => Promise.resolve(e), null),
      onProgress: (progress) => this.progressListeners.embedding?.(progress),
      // P4-7: vector snapshot cache directory, injected from `main/index.ts`.
      snapshotDir: () => this.snapshotDir || undefined,
    });
  }

  /** Cache directory for the persisted vector snapshot (empty = disabled). */
  private snapshotDir = '';

  /** Set the snapshot cache directory (called from `main/index.ts`). */
  setSnapshotDir(dir: string): void {
    this.snapshotDir = dir;
  }

  /** Broadcast hooks wired by the IPC layer (`glossary:modelProgress` etc.). */
  private readonly progressListeners: {
    model?: (progress: GlossaryModelProgress) => void;
    modelState?: () => void;
    embedding?: (progress: GlossaryEmbeddingProgress) => void;
  } = {};

  setProgressListeners(listeners: {
    model?: (progress: GlossaryModelProgress) => void;
    modelState?: () => void;
    embedding?: (progress: GlossaryEmbeddingProgress) => void;
  }): void {
    Object.assign(this.progressListeners, listeners);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  /** Current (cached) glossary settings. */
  getSettings(): GlossarySettings {
    return this.settings;
  }

  /** Re-read settings from the database (after an external write). */
  reloadSettings(): GlossarySettings {
    this.settings = this.loadSettings();
    return this.settings;
  }

  /** Persist a settings patch and invalidate the cached index. */
  setSettings(patch: Partial<GlossarySettings>): GlossarySettings {
    const current = this.settings;
    this.settings = mergeGlossarySettings({
      ...current,
      ...patch,
      // Merge nested objects so a partial patch never resets sibling keys.
      budget: { ...current.budget, ...(patch.budget ?? {}) },
      chunkThresholdChars: { ...current.chunkThresholdChars, ...(patch.chunkThresholdChars ?? {}) },
      layers: { ...current.layers, ...(patch.layers ?? {}) },
      thresholds: { ...current.thresholds, ...(patch.thresholds ?? {}) },
      localEmbedding: { ...current.localEmbedding, ...(patch.localEmbedding ?? {}) },
    });
    try {
      setSetting(GLOSSARY_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (err) {
      log.error('[Glossary] failed to persist settings:', err);
    }
    this.invalidate();
    // Semantic configuration changes need a fresh capability check and a
    // vector re-index (backend / model / layer toggles).
    if (patch.layers || patch.localEmbedding || patch.thresholds) {
      this.semantic.reset();
      this.embeddingJob.invalidate();
      if (this.settings.localEmbedding.enabled) {
        void this.embeddingJob.run().catch((): void => undefined);
      }
    }
    return this.settings;
  }

  private loadSettings(): GlossarySettings {
    try {
      const raw = getSetting(GLOSSARY_SETTINGS_KEY);
      if (!raw) return mergeGlossarySettings(null);
      return mergeGlossarySettings(JSON.parse(raw) as Partial<GlossarySettings>);
    } catch (err) {
      log.warn('[Glossary] failed to read settings, using defaults:', err);
      return mergeGlossarySettings(null);
    }
  }

  // ── Index lifecycle ───────────────────────────────────────────────────────

  /** Current glossary version (bumped by every write). */
  getVersion(): number {
    const raw = getSetting(GLOSSARY_VERSION_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  /**
   * Invalidate the cached index.
   *
   * With an `entryId` (single add/update/delete) the change is tracked in a
   * small **delta layer**: only that entry is re-read and scanned linearly,
   * which keeps single-row edits instant on a 50k-row table. Without an id, or
   * once the delta grows past 200 entries, the whole index is rebuilt lazily.
   */
  invalidate(entryId?: string): void {
    this.cache.clear();
    if (entryId && this.builtVersion >= 0 && this.client.getIndex()) {
      this.deltaIds.add(entryId);
      if (this.deltaIds.size > DELTA_LIMIT) {
        this.resetIndex();
        return;
      }
      // The delta layer keeps the (stale) base index current, so record the
      // new version to prevent `ensureReady` from doing a full rebuild.
      this.builtVersion = this.getVersion();
      this.refreshDelta();
      return;
    }
    this.resetIndex();
  }

  private resetIndex(): void {
    this.builtVersion = -1;
    this.workerVersion = -1;
    this.deltaIds.clear();
    this.deltaRemovedIds.clear();
    this.deltaIndex = null;
  }

  /** Re-read the changed entries and rebuild the (tiny) delta index. */
  private refreshDelta(): void {
    if (this.deltaIds.size === 0) {
      this.deltaIndex = null;
      this.deltaRemovedIds.clear();
      return;
    }
    const ids = [...this.deltaIds];
    const rows = this.loadRows(ids);
    const present = new Set(rows.map((row) => row.id));
    for (const id of ids) {
      if (present.has(id)) this.deltaRemovedIds.delete(id);
      else this.deltaRemovedIds.add(id);
    }
    this.deltaIndex = rows.length > 0 ? new GlossaryIndex(rows) : null;
  }

  /** Entry lookup preferring the delta layer (newest values). */
  private lookupEntry(entryId: string): GlossaryEntryView | undefined {
    if (this.deltaRemovedIds.has(entryId)) return undefined;
    return this.deltaIndex?.getEntry(entryId) ?? this.client.getIndex()?.getEntry(entryId);
  }

  /** Build the index now (called after the main window is ready). */
  warmUp(): void {
    try {
      this.ensureReady();
      log.info('[Glossary] warm-up complete', {
        version: this.builtVersion,
        entries: this.rows.length,
      });
    } catch (err) {
      log.warn('[Glossary] warm-up failed:', err);
    }
  }

  /** Build the worker index ahead of the first large scan. */
  async warmUpAsync(): Promise<void> {
    this.ensureReady();
    if (this.rows.length >= WORKER_ENTRY_THRESHOLD) {
      await this.ensureWorkerBuilt();
    }
    // Build the semantic vectors in the background; failures are swallowed by
    // the capability gate and never block start-up.
    if (this.semantic.isAvailable()) {
      void this.embeddingJob.run().catch((err) => log.warn('[Glossary] embedding job failed:', err));
    }
  }

  getStatus(): GlossaryIndexStatus {
    // Build lazily so the settings panel shows an accurate entry count even if
    // the idle warm-up has not run yet.
    try {
      this.ensureReady();
    } catch (err) {
      log.warn('[Glossary] index status build failed:', err);
    }
    const embedding = this.embeddingJob.getProgress();
    const model = this.modelManager.getStatus();
    return {
      version: this.builtVersion >= 0 ? this.builtVersion : this.getVersion(),
      entries: this.rows.length,
      indexReady: this.builtVersion >= 0,
      engine: this.semantic.isAvailable() && this.embeddingJob.vectorIndex.size > 0 ? 'l1-l4' : 'l1-l3',
      worker: this.client.mode,
      model,
      embedded: embedding.done,
      embeddingTotal: Math.max(embedding.total, this.rows.length),
      embeddingRunning: embedding.running,
    };
  }

  /** Current model-card status (for IPC). */
  getModelStatus() {
    return this.modelManager.getStatus();
  }

  /** Background vector indexing progress. */
  getEmbeddingProgress(): GlossaryEmbeddingProgress {
    return this.embeddingJob.getProgress();
  }

  /** Start (or resume) background vector indexing. */
  async startEmbedding(): Promise<GlossaryEmbeddingProgress> {
    this.embeddingJob.resume();
    return this.embeddingJob.run();
  }

  /** Pause background vector indexing after the current batch. */
  pauseEmbedding(): void {
    this.embeddingJob.pause();
  }

  /**
   * Re-index vectors after a bulk change (import / replace). No-op when the
   * semantic layer is unavailable; failures are swallowed.
   */
  async refreshEmbeddings(): Promise<void> {
    if (!this.semantic.isAvailable()) return;
    try {
      this.ensureReady();
      await this.embeddingJob.run();
    } catch (err) {
      log.warn('[Glossary] embedding refresh failed:', err);
    }
  }

  dispose(): void {
    this.client.dispose();
    this.cache.clear();
    this.resetIndex();
    this.embeddingJob.invalidate();
    this.modelManager.dispose();
  }

  /** Ensure the in-process index matches the current glossary version. */
  private ensureReady(): void {
    const version = this.getVersion();
    if (this.builtVersion === version && this.client.getIndex()) return;
    const rows = this.loadRows();
    this.client.buildInline(rows);
    this.rows = rows;
    this.builtVersion = version;
    this.deltaIds.clear();
    this.deltaRemovedIds.clear();
    this.deltaIndex = null;
    this.cache.clear();    this.embeddingJob.invalidate();    log.info('[Glossary] index built', { version, entries: rows.length });
  }

  /** Build the worker copy of the index when the version changed. */
  private async ensureWorkerBuilt(): Promise<void> {
    const version = this.getVersion();
    if (this.workerVersion === version && this.client.mode === 'worker') return;
    await this.client.build(this.rows);
    this.workerVersion = version;
  }

  /**
   * Read glossary entries + their stored aliases.
   * `ids` restricts the load to the delta entries (single-row edits).
   */
  private loadRows(ids?: string[]): GlossaryIndexRow[] {
    const db = getDatabase();
    const scopedIds = ids ?? null;
    if (scopedIds && scopedIds.length === 0) return [];

    const placeholders = scopedIds ? scopedIds.map(() => '?').join(',') : '';
    const query = <T>(sql: string): T[] =>
      (scopedIds ? db.prepare(sql).all(...scopedIds) : db.prepare(sql).all()) as T[];

    const rows = query<MappingRow>(
      scopedIds
        ? `SELECT id, en, zh_cn, zh_tw, do_not_use, kind FROM translation_mappings WHERE id IN (${placeholders})`
        : 'SELECT id, en, zh_cn, zh_tw, do_not_use, kind FROM translation_mappings'
    );
    const aliasRows = query<AliasRow>(
      scopedIds
        ? `SELECT entry_id, lang, alias, alias_key, alias_kind FROM glossary_aliases WHERE entry_id IN (${placeholders})`
        : 'SELECT entry_id, lang, alias, alias_key, alias_kind FROM glossary_aliases'
    );

    const byEntry = new Map<string, { en: GlossaryAlias[]; zh: GlossaryAlias[] }>();
    for (const alias of aliasRows) {
      const bucket = byEntry.get(alias.entry_id) ?? { en: [], zh: [] };
      const list = alias.lang === 'zh' ? bucket.zh : bucket.en;
      list.push({
        alias: alias.alias,
        aliasKey: alias.alias_key,
        kind: (alias.alias_kind as GlossaryAlias['kind']) ?? 'primary',
      });
      byEntry.set(alias.entry_id, bucket);
    }

    return rows.map((row) => {
      const aliases = byEntry.get(row.id);
      return {
        id: row.id,
        en: row.en,
        zhCN: row.zh_cn,
        zhTW: row.zh_tw,
        kind: row.kind,
        doNotUse: parseDoNotUse(row.do_not_use),
        aliases: aliases && (aliases.en.length > 0 || aliases.zh.length > 0) ? aliases : undefined,
      };
    });
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /** Resolve a text synchronously (no semantic layer — embeddings are async). */
  resolveSync(
    text: string,
    scenario: GlossaryMatchScenario,
    options: ResolveOptions = {}
  ): GlossaryResolveResult {
    const settings = options.settings ?? this.settings;
    if (!settings.enabled || !text.trim()) return EMPTY_RESULT;
    this.ensureReady();

    const cached = this.cache.get(this.cacheKey(text, scenario, options.targetLang, false));
    if (cached) return cached;

    const result = this.buildResult(text, scenario, settings, options.targetLang);
    this.remember(text, scenario, options.targetLang, result);
    return result;
  }

  /** Resolve a text, preferring the worker for very large glossaries/documents. */
  async resolve(
    text: string,
    scenario: GlossaryMatchScenario,
    options: ResolveOptions = {}
  ): Promise<GlossaryResolveResult> {
    const settings = options.settings ?? this.settings;
    if (!settings.enabled || !text.trim()) return EMPTY_RESULT;
    this.ensureReady();

    const semanticActive = this.semantic.isAvailable();
    const cacheKey = this.cacheKey(text, scenario, options.targetLang, semanticActive);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const startedAt = Date.now();
    const scanOptions = this.scanOptions(scenario, settings, options.targetLang);
    // A pending delta layer is only visible to the in-process index, so fall
    // back to the synchronous path until the next full rebuild.
    const useWorker =
      this.deltaIds.size === 0 &&
      (this.rows.length >= WORKER_ENTRY_THRESHOLD || text.length >= WORKER_TEXT_THRESHOLD);

    let matches: GlossaryMatch[];
    if (useWorker) {
      try {
        await this.ensureWorkerBuilt();
        matches = (await this.client.match(text, scanOptions)).filter(
          (match) => !this.deltaRemovedIds.has(match.entryId)
        );
      } catch (err) {
        log.warn('[Glossary] worker match failed, using in-process index:', err);
        matches = this.collectInlineMatches(text, scanOptions);
      }
    } else {
      matches = this.collectInlineMatches(text, scanOptions);
    }

    // Optional evidence from the layers above L3: L5a candidates (literal or
    // semantic) and L4 semantic similarity over short candidate strings.
    const candidates = options.candidates ?? [];
    const extraEvidence: { entryId: string; layer: GlossaryLayer; similarity: number }[] = [];
    if (candidates.length > 0) extraEvidence.push(...this.candidateEvidence(candidates, scanOptions));
    if (semanticActive) {
      extraEvidence.push(
        ...(await this.semanticEvidence(text, scenario, settings, candidates, options))
      );
    }

    const result = this.finalizeMatches(matches, settings, startedAt, extraEvidence);
    this.remember(text, scenario, options.targetLang, result, semanticActive);
    return result;
  }

  /** In-process scan of the base index plus the delta layer. */
  private collectInlineMatches(
    text: string,
    scanOptions: ReturnType<GlossaryService['scanOptions']>
  ): GlossaryMatch[] {
    const base = this.client.getIndex();
    const matches = base
      ? base.match(text, scanOptions).filter((match) => !this.deltaRemovedIds.has(match.entryId))
      : [];
    if (this.deltaIndex) matches.push(...this.deltaIndex.match(text, scanOptions));
    return matches;
  }

  /** Scan base + delta indexes and fuse the evidence into tiered hits. */
  private buildResult(
    text: string,
    scenario: GlossaryMatchScenario,
    settings: GlossarySettings,
    targetLang?: GlossaryTargetLang
  ): GlossaryResolveResult {
    const startedAt = Date.now();
    const scanOptions = this.scanOptions(scenario, settings, targetLang);
    const matches = this.collectInlineMatches(text, scanOptions);
    return this.finalizeMatches(matches, settings, startedAt);
  }

  private finalizeMatches(
    matches: GlossaryMatch[],
    settings: GlossarySettings,
    startedAt: number,
    extraEvidence: { entryId: string; layer: GlossaryLayer; similarity: number }[] = []
  ): GlossaryResolveResult {
    const fused = fuseGlossaryMatches(matches, (id) => this.lookupEntry(id), settings, extraEvidence);
    const layers = emptyLayerCounts();
    for (const match of matches) layers[match.layer] += 1;
    for (const evidence of extraEvidence) layers[evidence.layer] += 1;
    return {
      hits: fused.hits,
      matchCount: matches.length,
      candidateCount: fused.candidateCount,
      layers,
      elapsedMs: Date.now() - startedAt,
    };
  }

  private scanOptions(
    scenario: GlossaryMatchScenario,
    settings: GlossarySettings,
    targetLang?: GlossaryTargetLang
  ) {
    const side: 'en' | 'zh' | 'both' =
      scenario === 'translation'
        ? targetLang === 'en'
          ? 'zh'
          : 'en'
        : 'both';
    return {
      side,
      enableVariant: settings.layers.variant,
      enableFuzzy: settings.layers.fuzzy,
      fuzzyThreshold: settings.thresholds.fuzzy,
    };
  }

  private cacheKey(
    text: string,
    scenario: GlossaryMatchScenario,
    targetLang?: GlossaryTargetLang,
    semantic = false
  ): string {
    return `${this.builtVersion}|${scenario}|${targetLang ?? '-'}|${semantic ? 's' : 'l'}|${text.length}|${fnv1a(text)}`;
  }

  private remember(
    text: string,
    scenario: GlossaryMatchScenario,
    targetLang: GlossaryTargetLang | undefined,
    result: GlossaryResolveResult,
    semantic = false
  ): void {
    if (this.cache.size >= GlossaryService.CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(this.cacheKey(text, scenario, targetLang, semantic), result);
  }

  // ── Translation integration (P2a-5) ───────────────────────────────────────

  /**
   * Build the translation glossary block for one file.
   *
   * Only entries that actually occur in `sourceText` are injected, which
   * removes the 500-entry cap and the irrelevant-term noise of the previous
   * implementation (design §2.7).
   */
  async buildTranslationContext(
    targetLang: 'en' | 'zh-CN' | 'zh-TW',
    sourceText: string
  ): Promise<TranslationContext> {
    if (!this.settings.enabled || !this.settings.useInTranslation) return this.emptyContext();
    const result = await this.resolve(sourceText, 'translation', { targetLang });
    return this.renderTranslationContext(targetLang, result);
  }

  /** Synchronous variant used by `MappingService.getMappingContext()`. */
  buildTranslationContextSync(
    targetLang: 'en' | 'zh-CN' | 'zh-TW',
    sourceText: string
  ): TranslationContext {
    if (!this.settings.enabled || !this.settings.useInTranslation) return this.emptyContext();
    const result = this.resolveSync(sourceText, 'translation', { targetLang });
    return this.renderTranslationContext(targetLang, result);
  }

  private emptyContext(): TranslationContext {
    return {
      text: '',
      count: 0,
      tokens: 0,
      truncated: 0,
      hits: [],
      result: EMPTY_RESULT,
    };
  }

  private renderTranslationContext(
    targetLang: 'en' | 'zh-CN' | 'zh-TW',
    result: GlossaryResolveResult
  ): TranslationContext {
    if (result.hits.length === 0) return { ...this.emptyContext(), result };

    const budget = glossaryBudgetFor(this.settings, 'translation');
    const block = buildGlossaryPromptBlock({
      hits: result.hits,
      lookup: (id) => this.lookupEntry(id),
      scenario: 'translation',
      targetLang,
      budgetTokens: budget,
    });

    if (block.text) {
      log.info(formatResolveLog(result, this.builtVersion, block.tokens, block.truncated));
    }

    return {
      text: block.text,
      count: block.includedIds.length,
      tokens: block.tokens,
      truncated: block.truncated,
      hits: result.hits,
      result,
    };
  }

  /** Deterministic R3 check after a chunk/document translation. */
  checkTranslation(
    sourceText: string,
    targetText: string,
    hits: GlossaryResolveResult['hits'],
    targetLang: 'en' | 'zh-CN' | 'zh-TW'
  ): TermIssue[] {
    if (!this.settings.enabled || !this.settings.ruleCheck) return [];
    return checkTranslationTerms({
      sourceText,
      targetText,
      hits,
      lookup: (id) => this.lookupEntry(id),
      targetLang,
      tierAOnly: true,
    });
  }

  // ── P3: writer / review integration ───────────────────────────────────────

  /** Public entry lookup (renderer hit panel, prompt blocks). */
  getEntry(entryId: string): GlossaryEntryView | undefined {
    try {
      this.ensureReady();
    } catch (err) {
      log.warn('[Glossary] entry lookup skipped, index unavailable:', err);
      return undefined;
    }
    return this.lookupEntry(entryId);
  }

  /** Batch entry lookup (preserves the requested order, drops unknown ids). */
  getEntries(entryIds: string[]): GlossaryEntryView[] {
    if (!Array.isArray(entryIds) || entryIds.length === 0) return [];
    try {
      this.ensureReady();
    } catch (err) {
      log.warn('[Glossary] entry lookup skipped, index unavailable:', err);
      return [];
    }
    const out: GlossaryEntryView[] = [];
    for (const id of entryIds) {
      const entry = this.lookupEntry(id);
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * Render the glossary prompt block for a set of hits.
   * Shared by the writer (`writing`), the reviewer (`review`) and the
   * settings UI; returns an empty block when the master switch is off.
   */
  buildPromptBlock(
    scenario: GlossaryMatchScenario,
    hits: GlossaryResolveResult['hits'],
    targetLang?: GlossaryTargetLang
  ): { text: string; tokens: number; truncated: number; includedIds: string[] } {
    if (!this.settings.enabled || hits.length === 0) {
      return { text: '', tokens: 0, truncated: 0, includedIds: [] };
    }
    return buildGlossaryPromptBlock({
      hits,
      lookup: (id) => this.lookupEntry(id),
      scenario,
      targetLang,
      budgetTokens: glossaryBudgetFor(this.settings, scenario),
    });
  }

  /**
   * Deterministic reviewer comments for an English draft (R1 + R2).
   * Returns `ReviewComment[]` with `origin: 'glossary'` ready to merge with the
   * AI reviewer output.
   */
  checkDraft(
    draftText: string,
    sourceText: string,
    hits: GlossaryResolveResult['hits'],
    draftId: string
  ): ReviewComment[] {
    if (!this.settings.enabled || !this.settings.useInReview || !this.settings.ruleCheck) return [];
    try {
      const issues = checkDraftTerms({
        draftText,
        sourceText,
        hits,
        lookup: (id) => this.lookupEntry(id),
        tierAOnly: true,
      });
      return toReviewComments(issues, draftId);
    } catch (err) {
      log.warn('[Glossary] draft check failed:', err);
      return [];
    }
  }

  /**
   * Deterministic reviewer comments for a translation (R3 + R4).
   */
  checkLocalized(
    sourceText: string,
    targetText: string,
    hits: GlossaryResolveResult['hits'],
    targetLang: 'en' | 'zh-CN' | 'zh-TW',
    draftId: string
  ): ReviewComment[] {
    if (!this.settings.enabled || !this.settings.useInReview || !this.settings.ruleCheck) return [];
    try {
      const input = {
        sourceText,
        targetText,
        hits,
        lookup: (id: string) => this.lookupEntry(id),
        targetLang,
        tierAOnly: true,
      };
      const issues = [...checkTranslationTerms(input), ...checkPhraseReuse(input)];
      return toReviewComments(issues, draftId);
    } catch (err) {
      log.warn('[Glossary] translation check failed:', err);
      return [];
    }
  }

  /**
   * P4-6: deterministic "Do not use" check for an English draft.
   *
   * Forbidden wordings never enter the matching index (they must not be
   * injected as approved terminology), so this walks the explicit lists.
   */
  checkForbidden(draftText: string, draftId: string): ReviewComment[] {
    if (!this.settings.enabled || !this.settings.useInReview || !this.settings.forbiddenCheck) {
      return [];
    }
    try {
      const entries = this.entriesWithForbidden();
      if (entries.length === 0) return [];
      return toReviewComments(checkForbiddenTerms({ draftText, entries }), draftId);
    } catch (err) {
      log.warn('[Glossary] forbidden wording check failed:', err);
      return [];
    }
  }

  /**
   * P4-3: compact terminology block used in the analysis prompt.
   *
   * Matches against the ingest context before the analyzer runs, so the
   * analytical summary already uses the approved wording and the writer needs
   * less correction afterwards. Deterministic only (L1–L3): no extra AI calls.
   */
  buildAnalyzeContext(text: string): { text: string; count: number; hits: GlossaryHit[] } {
    if (!this.settings.enabled || !this.settings.useInWriter || !this.settings.analyzeInjection) {
      return { text: '', count: 0, hits: [] };
    }
    if (!text.trim()) return { text: '', count: 0, hits: [] };
    try {
      const result = this.resolveSync(text, 'writing');
      if (result.hits.length === 0) return { text: '', count: 0, hits: result.hits };
      const block = this.buildPromptBlock('writing', result.hits);
      return { text: block.text, count: block.includedIds.length, hits: result.hits };
    } catch (err) {
      log.warn('[Glossary] analyze context failed:', err);
      return { text: '', count: 0, hits: [] };
    }
  }

  /**
   * P4-4: terminology usage report for the final document (pre-export).
   * Evaluates the run's hits (plus any manual additions) against the text.
   */
  buildUsageReport(text: string, hits: GlossaryResolveResult['hits'] = []): GlossaryUsageReport {
    const tierById = new Map(hits.map((hit) => [hit.entryId, hit.tier]));
    const entries: GlossaryEntryView[] = [];
    const seen = new Set<string>();
    try {
      this.ensureReady();
    } catch (err) {
      log.warn('[Glossary] usage report skipped, index unavailable:', err);
    }
    for (const hit of hits) {
      if (seen.has(hit.entryId)) continue;
      seen.add(hit.entryId);
      const entry = this.lookupEntry(hit.entryId);
      if (entry) entries.push(entry);
    }
    return buildUsageReport({
      text,
      entries,
      tierOf: (id) => tierById.get(id) ?? null,
    });
  }

  /**
   * P4-8: on-demand lookup used by the writer's `glossary_lookup` tool.
   * Deterministic only (L1/L2), returns up to `limit` compact matches.
   */
  lookupForTool(query: string, limit = 5): { en: string; zhCN: string; zhTW: string }[] {
    if (!this.settings.enabled || !this.settings.useInWriter) return [];
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    try {
      this.ensureReady();
      const index = this.client.getIndex();
      if (!index) return [];
      const max = Math.min(Math.max(limit, 1), 20);
      const seen = new Set<string>();
      const out: { en: string; zhCN: string; zhTW: string }[] = [];
      for (const match of index.match(trimmed, { enableFuzzy: false })) {
        if (seen.has(match.entryId)) continue;
        seen.add(match.entryId);
        const entry = this.lookupEntry(match.entryId);
        if (!entry || !entry.en) continue;
        out.push({ en: entry.en, zhCN: entry.zhCN, zhTW: entry.zhTW });
        if (out.length >= max) break;
      }
      return out;
    } catch (err) {
      log.warn('[Glossary] tool lookup failed:', err);
      return [];
    }
  }

  /** Every indexed entry that carries a "Do not use" list. */  private entriesWithForbidden(): GlossaryEntryView[] {
    this.ensureReady();
    const ids = new Set<string>();
    for (const row of this.rows) {
      if (row.doNotUse && row.doNotUse.length > 0) ids.add(row.id);
    }
    for (const id of this.deltaIds) {
      const entry = this.lookupEntry(id);
      if (entry?.doNotUse && entry.doNotUse.length > 0) ids.add(id);
    }
    const entries: GlossaryEntryView[] = [];
    for (const id of ids) {
      if (this.deltaRemovedIds.has(id)) continue;
      const entry = this.lookupEntry(id);
      if (entry?.doNotUse && entry.doNotUse.length > 0) entries.push(entry);
    }
    return entries;
  }

  // ── Settings-page playground (P2a-6) ──────────────────────────────────────

  async testMatch(payload: GlossaryTestMatchPayload): Promise<GlossaryTestMatchResult> {
    const startedAt = Date.now();
    const scenario = payload.scenario ?? 'writing';
    const targetLang = payload.targetLang;
    const result = await this.resolve(payload.text ?? '', scenario, { targetLang });
    const block = buildGlossaryPromptBlock({
      hits: result.hits,
      lookup: (id) => this.lookupEntry(id),
      scenario,
      targetLang,
      budgetTokens: glossaryBudgetFor(this.settings, scenario),
    });
    const entries: Record<string, GlossaryEntryView> = {};
    for (const hit of result.hits) {
      const entry = this.lookupEntry(hit.entryId);
      if (entry) entries[hit.entryId] = entry;
    }
    return {
      hits: result.hits,
      entries,
      block: block.text,
      tokens: block.tokens,
      truncated: block.truncated,
      layers: result.layers,
      elapsedMs: Date.now() - startedAt,
      entryCount: this.rows.length,
    };
  }

  // ── L5a candidates + L4 semantic evidence (P2b / P2c) ─────────────────────

  /** L5a candidates still go through L1/L2 so abbreviations and aliases match. */
  private candidateEvidence(
    candidates: GlossaryTermCandidate[],
    scanOptions: ReturnType<GlossaryService['scanOptions']>
  ): { entryId: string; layer: GlossaryLayer; similarity: number }[] {
    const index = this.client.getIndex();
    if (!index) return [];
    const evidence: { entryId: string; layer: GlossaryLayer; similarity: number }[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      for (const raw of [candidate.surface, candidate.englishGuess]) {
        const query = raw?.trim();
        if (!query || query.length < 2) continue;
        for (const match of index.match(query, { ...scanOptions, enableFuzzy: false })) {
          const key = `${match.entryId}|${match.layer}`;
          if (seen.has(key)) continue;
          seen.add(key);
          evidence.push({ entryId: match.entryId, layer: match.layer, similarity: match.similarity });
        }
      }
    }
    return evidence;
  }

  /**
   * Short query strings for the vector layer. Design §2.5.6.4: never embed a
   * whole document — only candidate concepts and (for phrase entries) sentences.
   */
  private semanticQueryTexts(
    text: string,
    scenario: GlossaryMatchScenario,
    candidates: GlossaryTermCandidate[]
  ): string[] {
    const queries: string[] = [];
    for (const candidate of candidates) {
      if (candidate.surface) queries.push(candidate.surface.slice(0, 200));
      if (candidate.englishGuess) queries.push(candidate.englishGuess.slice(0, 200));
    }
    if (scenario !== 'writing' || queries.length === 0) {
      const plain = preparePlainText(text);
      for (const sentence of splitSentences(plain).slice(0, 25)) {
        queries.push(sentence.text.slice(0, 300));
      }
    }
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const query of queries) {
      const trimmed = query.trim();
      if (trimmed.length < 3) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(trimmed);
      if (unique.length >= 60) break;
    }
    return unique;
  }

  /**
   * L4 evidence: embed candidate strings, look up the nearest glossary vectors,
   * and escalate gray-zone candidates to L5b when a provider is available.
   */
  private async semanticEvidence(
    text: string,
    scenario: GlossaryMatchScenario,
    settings: GlossarySettings,
    candidates: GlossaryTermCandidate[],
    options: ResolveOptions
  ): Promise<{ entryId: string; layer: GlossaryLayer; similarity: number }[]> {
    const evidence: { entryId: string; layer: GlossaryLayer; similarity: number }[] = [];
    if (!settings.layers.semantic || !settings.localEmbedding.enabled) return evidence;

    const index = this.embeddingJob.vectorIndex;
    if (index.size === 0) {
      // First use: kick off background indexing; this run stays on L1–L3.
      void this.embeddingJob.run().catch((err) => log.warn('[Glossary] embedding job failed:', err));
      return evidence;
    }

    const queries = this.semanticQueryTexts(text, scenario, candidates);
    if (queries.length === 0) return evidence;

    const vectors = await this.semantic.withSemanticFallback(
      (embedder) => embedder.embed(queries, 'query'),
      [] as Float32Array[]
    );
    if (vectors.length === 0) return evidence;

    const candidateThreshold = settings.thresholds.semanticCandidate;
    const grayThreshold = settings.thresholds.semanticGray;
    const best = new Map<string, number>();
    for (const vector of vectors) {
      for (const hit of index.topK(vector, 5, grayThreshold)) {
        const entry = this.lookupEntry(hit.entryId);
        if (!entry) continue;
        // Translation is literal-first: semantic only assists phrase entries.
        if (scenario === 'translation' && entry.kind !== 'phrase') continue;
        if ((best.get(hit.entryId) ?? 0) < hit.score) best.set(hit.entryId, hit.score);
      }
    }

    const gray: { entryId: string; score: number }[] = [];
    for (const [entryId, score] of best) {
      if (score >= candidateThreshold) evidence.push({ entryId, layer: 'semantic', similarity: 1 });
      else gray.push({ entryId, score });
    }

    if (gray.length > 0 && options.provider && settings.aiAdjudication !== 'off') {
      for (const verdict of await this.adjudicateGrayZone(gray, options)) {
        if (verdict.entryId) evidence.push({ entryId: verdict.entryId, layer: 'ai', similarity: 1 });
      }
    }
    return evidence;
  }

  /** L5b: ask the model whether each gray-zone entry really applies. */
  private async adjudicateGrayZone(
    gray: { entryId: string; score: number }[],
    options: ResolveOptions
  ) {
    if (!options.provider) return [];
    const candidates: GlossaryAdjudicationCandidate[] = [];
    gray.slice(0, 50).forEach((candidate, index) => {
      const entry = this.lookupEntry(candidate.entryId);
      if (!entry) return;
      candidates.push({
        candidateId: `c${index}`,
        surface: entry.en || entry.zhCN,
        context: undefined,
        options: [{ entryId: entry.id, en: entry.en, zhCN: entry.zhCN, score: candidate.score }],
      });
    });
    if (candidates.length === 0) return [];
    try {
      const agent = new GlossaryAdjudicatorAgent(options.provider, {
        signal: options.signal,
        promptOverrides: options.promptOverrides,
        promptOverride: options.promptOverrides?.['glossaryAdjudicator'],
      });
      return await agent.adjudicate(candidates);
    } catch (err) {
      log.warn('[Glossary][L5b] adjudication failed:', err);
      return [];
    }
  }

  /**
   * Resolve source material for document generation (design §2.6 / P2c).
   *
   * Uses FileParser `terms[]` when available; otherwise extracts candidates
   * with L5a, then runs L1–L5 and returns the tiered hits for the writer.
   */
  async resolveForWriting(input: {
    text: string;
    terms?: GlossaryTermCandidate[];
    provider?: AIProvider;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
    promptOverrides?: PromptOverrides;
  }): Promise<GlossaryWritingResolveResult> {
    const settings = this.settings;
    const empty: GlossaryWritingResolveResult = {
      ...EMPTY_RESULT,
      candidates: [],
      semanticUsed: false,
      grayCount: 0,
    };
    if (!settings.enabled || !settings.useInWriter) return empty;

    let candidates = input.terms?.filter((term) => term.surface?.trim()) ?? [];
    if (candidates.length === 0 && input.provider && settings.aiCandidateExtraction) {
      try {
        const agent = new TermExtractorAgent(input.provider, {
          signal: input.signal,
          onProgress: input.onProgress,
          promptOverrides: input.promptOverrides,
          promptOverride: input.promptOverrides?.['termExtractor'],
        });
        candidates = await agent.extractTerms(input.text, { onProgress: input.onProgress });
      } catch (err) {
        log.warn('[Glossary][L5a] term extraction failed:', err);
      }
    }

    const result = await this.resolve(input.text, 'writing', {
      provider: input.provider,
      signal: input.signal,
      candidates,
      onProgress: input.onProgress,
      promptOverrides: input.promptOverrides,
    });
    const written = {
      ...result,
      candidates,
      semanticUsed: result.layers.semantic > 0,
      grayCount: result.layers.ai,
    };
    if (written.hits.length > 0) {
      log.info(
        `${formatResolveLog(result, this.builtVersion, 0, 0)} · candidates=${candidates.length} · semantic=${written.semanticUsed ? 'on' : 'off'} · ai=${written.grayCount}`
      );
    }
    return written;
  }

  // ── Model management (P2b, delegated to ModelManager) ────────────────────

  modelDownload(sourceIndex = 0) {
    return this.modelManager.download(sourceIndex);
  }

  cancelModelDownload(): void {
    this.modelManager.cancelDownload();
  }

  modelInstallPackage(filePath: string) {
    return this.modelManager.installPackage(filePath);
  }

  modelInstallFolder(dirPath: string) {
    return this.modelManager.installFolder(dirPath);
  }

  modelConfirmCustom() {
    return this.modelManager.confirmCustom();
  }

  modelExportPackage(destPath: string) {
    return this.modelManager.exportPackage(destPath);
  }

  modelVerify() {
    return this.modelManager.verify();
  }

  async modelRetry() {
    this.semantic.reset();
    return this.modelManager.retry();
  }

  modelRemove() {
    this.semantic.reset();
    this.embeddingJob.invalidate();
    return this.modelManager.remove();
  }

  modelClearNativeFailure(): void {
    this.modelManager.clearNativeFailure();
    this.semantic.reset();
  }

  /** Current progress of a running download/install (for IPC polling). */
  getModelProgress(): GlossaryModelProgress | null {
    return this.modelProgress;
  }

  /** Activate a freshly installed model (custom packages may change the id). */
  private activateModel(modelId: string): void {
    if (this.settings.localEmbedding.modelId === modelId) return;
    log.info('[Glossary][Model] activating installed model', { modelId });
    this.settings = mergeGlossarySettings({
      ...this.settings,
      localEmbedding: { ...this.settings.localEmbedding, modelId, enabled: true },
    });
    try {
      setSetting(GLOSSARY_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (err) {
      log.warn('[Glossary] failed to persist the active model id:', err);
    }
    this.invalidate();
  }
}

/** Convert deterministic term issues into review comments (P3, §2.8.4). */
function toReviewComments(issues: TermIssue[], draftId: string): ReviewComment[] {
  return issues.map((issue, index) => ({
    id: `glossary-${issue.rule}-${issue.entryId}-${index}`,
    draftId,
    type: issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : issue.severity === 'suggestion' ? 'suggestion' : 'info',
    section: 'Glossary',
    originalText: issue.originalText,
    suggestedText: issue.suggestedText,
    explanation: issue.explanation,
    accepted: false,
    origin: 'glossary',
    glossaryEntryId: issue.entryId,
  }));
}
