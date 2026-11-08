// Model lifecycle manager (design §2.5.6.6–2.5.6.8 / P2b-1, P2b-1a).
//
// Owns the model state machine, the three install channels (online download /
// offline package / folder), the embedder instance and the backend policy:
//
//   absent ─▶ downloading/installing ─▶ verifying ─▶ ready ─▶ degraded
//                                    └▶ failed(reason)
//
// Nothing here may throw into a workflow: every failure is recorded in the
// persisted state and reported to the UI, and callers simply get `null`.

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { net } from 'electron';
import log from 'electron-log';
import { getSetting, setSetting } from '../../storage/database';
import { createLocalEmbedder, type LocalEmbedder } from './local-embedder';
import {
  cleanupStaging,
  exportPackage as exportPackageTo,
  finalizeStagedDirectory,
  installFromFolder,
  installFromPackage,
  modelDirectory,
  modelsRoot,
  quickCheckInstalled,
  readInstalledInfo,
  removeModel,
  verifyInstalledHashes,
  type InstallOptions,
  type InstallResult,
} from './model-installer';
import { getModelSpec } from './model-manifest';
import { ModelError, type ModelFailureReason } from './backends/types';
import type {
  GlossaryModelFailureReason,
  GlossaryModelProgress,
  GlossaryModelState,
  GlossaryModelStatus,
  GlossaryRuntimeBackend,
  GlossarySettings,
} from '../../../../shared/types/glossary.types';

export const MODEL_STATE_KEY = 'glossary.model.state';
export const NATIVE_FAILED_KEY = 'glossary.model.nativeFailedAt';
/** A cached native failure is honoured for this long (design §2.5.6.8). */
const NATIVE_FAILURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Idle timeout for HTTP reads. */
const DOWNLOAD_IDLE_MS = 60_000;
/** Retries per file per source (exponential backoff). */
const DOWNLOAD_RETRIES = 3;

interface PersistedModelState {
  state: GlossaryModelState;
  reason?: string;
  reasonCode?: GlossaryModelFailureReason;
  source?: string;
  revision?: string;
  backend?: 'native' | 'wasm' | null;
  custom?: boolean;
  modelId: string;
  dims?: number;
  installedAt?: string;
  updatedAt?: string;
}

export interface ModelManagerOptions {
  /** Current glossary settings (owned by `GlossaryService`). */
  getSettings: () => GlossarySettings;
  /** Progress events for the settings-page model card. */
  onProgress?: (progress: GlossaryModelProgress) => void;
  /** Called whenever the persisted state changes. */
  onStateChange?: (status: GlossaryModelStatus) => void;
  /** Called after a successful install so the caller can activate the model. */
  onModelInstalled?: (modelId: string) => void;
}

export class ModelManager {
  private embedder: LocalEmbedder | null = null;
  private loading: Promise<LocalEmbedder | null> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private progress: GlossaryModelProgress | null = null;
  private downloadAbortController: AbortController | null = null;
  /** Model id awaiting a "custom model" confirmation. */
  private pendingCustomModelId: string | null = null;
  /** Original source of the pending install, replayed after confirmation. */
  private pendingInstall: { kind: 'folder' | 'package'; path: string } | null = null;

  constructor(private readonly options: ModelManagerOptions) {
    // A crashed install must not leave staging folders behind.
    try {
      cleanupStaging();
    } catch {
      /* ignore */
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private readPersisted(): PersistedModelState | null {
    try {
      const raw = getSetting(MODEL_STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PersistedModelState;
    } catch {
      return null;
    }
  }

  private writePersisted(patch: Partial<PersistedModelState>): void {
    const modelId = this.options.getSettings().localEmbedding.modelId;
    const current = this.readPersisted() ?? { state: 'absent' as GlossaryModelState, modelId };
    const next: PersistedModelState = { ...current, ...patch, modelId: patch.modelId ?? current.modelId ?? modelId };
    next.updatedAt = new Date().toISOString();
    try {
      setSetting(MODEL_STATE_KEY, JSON.stringify(next));
    } catch (err) {
      log.warn('[Glossary][Model] failed to persist state:', err);
    }
    this.options.onStateChange?.(this.getStatus());
  }

  private nativeFailedAt(): string | undefined {
    const raw = getSetting(NATIVE_FAILED_KEY) ?? undefined;
    if (!raw) return undefined;
    const at = new Date(raw).getTime();
    if (Number.isNaN(at) || Date.now() - at > NATIVE_FAILURE_TTL_MS) return undefined;
    return raw;
  }

  /** Honour a recent native load failure unless the app was upgraded since. */
  private preferWasm(): boolean {
    return Boolean(this.nativeFailedAt());
  }

  private recordNativeFailure(message: string): void {
    try {
      setSetting(NATIVE_FAILED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    log.warn('[Glossary][Model] native runtime failed; compatibility mode will be used:', message);
  }

  /** Clear the cached native failure (the "retry native" button). */
  clearNativeFailure(): void {
    try {
      setSetting(NATIVE_FAILED_KEY, '');
    } catch {
      /* ignore */
    }
    this.disposeEmbedder();
  }

  /** Full model-card status (design §2.11.3). */
  getStatus(): GlossaryModelStatus {
    const settings = this.options.getSettings();
    const modelId = settings.localEmbedding.modelId;
    const dir = modelDirectory(modelId);
    const persisted = this.readPersisted();
    const installed = quickCheckInstalled(dir);
    let state: GlossaryModelState = persisted?.state ?? (installed.ok ? 'ready' : 'absent');
    let reason = persisted?.reason;
    let reasonCode = persisted?.reasonCode;

    if (!installed.ok && state === 'ready') {
      state = 'failed';
      reasonCode = 'checksum';
      reason = installed.problems.join('; ');
    }

    const info = readInstalledInfo(dir);
    return {
      state,
      reason,
      reasonCode,
      source: persisted?.source,
      revision: persisted?.revision ?? info?.revision,
      backend: this.embedder?.backend ?? persisted?.backend ?? null,
      custom: info?.custom ?? persisted?.custom ?? false,
      installed: installed.ok,
      modelId,
      dims: info?.dims ?? persisted?.dims,
      installedAt: info?.installedAt ?? persisted?.installedAt,
      compatibility: (this.embedder?.backend ?? persisted?.backend) === 'wasm',
      nativeFailedAt: this.nativeFailedAt(),
      progress: this.progress ?? undefined,
    };
  }

  /** Is the model installed and usable right now? */
  isInstalled(): boolean {
    const settings = this.options.getSettings();
    return quickCheckInstalled(modelDirectory(settings.localEmbedding.modelId)).ok;
  }

  // ── Embedder lifecycle ────────────────────────────────────────────────────

  /**
   * Load (or reuse) the embedder. Returns `null` — never throws — when the
   * model is disabled, missing, corrupt, or the runtime cannot load it.
   */
  async getEmbedder(): Promise<LocalEmbedder | null> {
    const settings = this.options.getSettings();
    if (!settings.localEmbedding.enabled) return null;
    if (this.embedder) {
      this.touchIdleTimer();
      return this.embedder;
    }
    if (this.loading) return this.loading;

    this.loading = this.loadEmbedder(settings);
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async loadEmbedder(settings: GlossarySettings): Promise<LocalEmbedder | null> {
    const modelId = settings.localEmbedding.modelId;
    const dir = modelDirectory(modelId);
    const check = quickCheckInstalled(dir);
    if (!check.ok) {
      this.writePersisted({
        state: 'failed',
        reasonCode: 'checksum',
        reason: check.problems.join('; ') || 'model is not installed',
      });
      return null;
    }

    this.writePersisted({ state: 'verifying' });
    try {
      const embedder = await createLocalEmbedder({
        modelDir: dir,
        runtimeBackend: settings.localEmbedding.runtimeBackend,
        preferWasm: settings.localEmbedding.runtimeBackend === 'auto' && this.preferWasm(),
      });
      await embedder.selfTest();
      this.embedder = embedder;
      if (embedder.nativeError) this.recordNativeFailure(embedder.nativeError);
      const info = readInstalledInfo(dir);
      this.writePersisted({
        state: 'ready',
        reason: undefined,
        reasonCode: undefined,
        backend: embedder.backend,
        dims: info?.dims ?? embedder.dims,
        revision: info?.revision,
        custom: info?.custom,
        installedAt: info?.installedAt,
      });
      log.info('[Glossary][Model] embedder ready', {
        backend: embedder.backend,
        dims: embedder.dims,
        compatibility: Boolean(embedder.nativeError),
      });
      this.touchIdleTimer();
      return embedder;
    } catch (err) {
      const reasonCode = mapReasonCode(err);
      const message = err instanceof Error ? err.message : String(err);
      if (reasonCode === 'runtime_load' && settings.localEmbedding.runtimeBackend === 'auto') {
        this.recordNativeFailure(message);
      }
      this.writePersisted({ state: 'failed', reasonCode, reason: message });
      log.warn('[Glossary][Model] embedder unavailable:', message);
      return null;
    }
  }

  /** Mark the semantic layer degraded for the rest of this session. */
  markDegraded(reason: string): void {
    this.disposeEmbedder();
    this.writePersisted({ state: 'degraded', reason, reasonCode: 'inference' });
  }

  /** Retry from `failed`/`degraded` (the "retry" button). */
  async retry(): Promise<GlossaryModelStatus> {
    this.writePersisted({ state: 'verifying', reason: undefined, reasonCode: undefined });
    await this.getEmbedder();
    return this.getStatus();
  }

  private touchIdleTimer(): void {
    const seconds = this.options.getSettings().localEmbedding.idleUnloadSec;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!seconds || seconds <= 0) return;
    this.idleTimer = setTimeout(() => {
      // Compatibility mode holds ~650 MB of WASM memory that `release()` does
      // not return, so the embedder is fully discarded and reloaded on demand.
      log.info('[Glossary][Model] idle unload');
      this.disposeEmbedder();
    }, seconds * 1000);
    this.idleTimer.unref?.();
  }

  private disposeEmbedder(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const current = this.embedder;
    this.embedder = null;
    if (current) void current.dispose().catch((): void => undefined);
  }

  dispose(): void {
    if (this.downloadAbortController) this.downloadAbortController.abort();
    this.disposeEmbedder();
  }

  // ── Install channels ──────────────────────────────────────────────────────

  /** Channel ①: download from the configured sources (with Range resume). */
  async download(sourceIndex = 0): Promise<GlossaryModelStatus> {
    const settings = this.options.getSettings();
    const modelId = settings.localEmbedding.modelId;
    const spec = getModelSpec(modelId);
    if (!spec) throw new ModelError('incompatible', `no built-in download manifest for "${modelId}"`);

    const sources =
      settings.localEmbedding.downloadSources?.length > 0
        ? settings.localEmbedding.downloadSources
        : spec.downloadSources;
    const ordered = [...sources.slice(sourceIndex), ...sources.slice(0, sourceIndex)];

    this.downloadAbortController = new AbortController();
    const signal = this.downloadAbortController.signal;
    const staged = path.join(modelsRoot(), '.staging', `${modelId}-${Date.now()}`);
    fs.mkdirSync(staged, { recursive: true });

    try {
      this.writePersisted({ state: 'downloading', reason: undefined, reasonCode: undefined });
      for (const [name, expected] of Object.entries(spec.files)) {
        const dest = path.join(staged, name);
        let lastError: unknown = null;
        for (const base of ordered) {
          const url = `${base.replace(/\/$/, '')}/${encodeURIComponent(name)}`;
          try {
            await this.downloadFile(url, dest, expected.size, signal, name);
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            if (signal.aborted) throw new ModelError('user_cancel', 'download cancelled');
            log.warn('[Glossary][Model] download failed, trying next source', {
              url,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        if (lastError) throw lastError;
      }

      this.progress = { phase: 'verify' };
      this.options.onProgress?.(this.progress);
      this.writePersisted({ state: 'verifying' });

      const result = await finalizeStagedDirectory(staged, modelId, 'download', {
        runtimeBackend: settings.localEmbedding.runtimeBackend,
        preferWasm: settings.localEmbedding.runtimeBackend === 'auto' && this.preferWasm(),
      });
      this.applyInstallResult(result);
      return this.getStatus();
    } catch (err) {
      removeQuietly(staged);
      const reasonCode = mapReasonCode(err);
      const message = err instanceof Error ? err.message : String(err);
      this.writePersisted({ state: 'failed', reasonCode, reason: message });
      throw err;
    } finally {
      this.progress = null;
      this.downloadAbortController = null;
    }
  }

  /** Cancel an in-flight download. */
  cancelDownload(): void {
    this.downloadAbortController?.abort();
  }

  /** Channel ②: install from an offline package (`.zip`). */
  async installPackage(filePath: string): Promise<InstallResult> {
    this.writePersisted({ state: 'installing' });
    const buffer = fs.readFileSync(filePath);
    // The package manifest is authoritative for its own model id.
    const result = await installFromPackage(buffer, this.installOptions(false, false));
    if (result.status === 'needs_confirm') {
      this.pendingCustomModelId = result.modelId;
      this.pendingInstall = { kind: 'package', path: filePath };
    } else {
      this.pendingInstall = null;
      this.applyInstallResult(result);
    }
    return result;
  }

  /** Channel ③: install from a folder. */
  async installFolder(dirPath: string): Promise<InstallResult> {
    this.writePersisted({ state: 'installing' });
    const result = await installFromFolder(dirPath, this.installOptions());
    if (result.status === 'needs_confirm') {
      this.pendingCustomModelId = result.modelId;
      this.pendingInstall = { kind: 'folder', path: dirPath };
    } else {
      this.pendingInstall = null;
      this.applyInstallResult(result);
    }
    return result;
  }

  /** Confirm installing the pending custom model (replays the install). */
  async confirmCustom(): Promise<InstallResult> {
    const modelId = this.pendingCustomModelId;
    const pending = this.pendingInstall;
    if (!modelId || !pending) {
      throw new ModelError('incompatible', 'no custom model installation is pending');
    }
    log.info('[Glossary][Model] custom model confirmed', { modelId });
    const options = this.installOptions(true, pending.kind !== 'package');
    const result =
      pending.kind === 'package'
        ? await installFromPackage(fs.readFileSync(pending.path), options)
        : await installFromFolder(pending.path, options);
    this.pendingCustomModelId = null;
    this.pendingInstall = null;
    this.applyInstallResult(result);
    return result;
  }

  /** Export the installed model as an offline package. */
  exportPackage(destPath: string): { path: string; files: number } {
    return exportPackageTo(this.options.getSettings().localEmbedding.modelId, destPath);
  }

  /** Full SHA-256 re-verification ("verify again"). */
  verify(): GlossaryModelStatus {
    const settings = this.options.getSettings();
    const dir = modelDirectory(settings.localEmbedding.modelId);
    const result = verifyInstalledHashes(dir);
    if (!result.ok) {
      this.disposeEmbedder();
      this.writePersisted({ state: 'failed', reasonCode: 'checksum', reason: result.problems.join('; ') });
    } else {
      const info = readInstalledInfo(dir);
      this.writePersisted({
        state: this.embedder ? 'ready' : info ? 'ready' : 'absent',
        reason: undefined,
        reasonCode: undefined,
        revision: info?.revision,
      });
    }
    return this.getStatus();
  }

  /** Remove the model and unload the embedder. */
  remove(): GlossaryModelStatus {
    const modelId = this.options.getSettings().localEmbedding.modelId;
    this.disposeEmbedder();
    removeModel(modelId);
    this.writePersisted({ state: 'absent', reason: undefined, reasonCode: undefined });
    return this.getStatus();
  }

  private installOptions(confirmCustom = false, useSettingsModelId = true): InstallOptions {
    const settings = this.options.getSettings();
    return {
      modelId: useSettingsModelId ? settings.localEmbedding.modelId : undefined,
      confirmCustom,
      runtimeBackend: settings.localEmbedding.runtimeBackend,
      preferWasm: settings.localEmbedding.runtimeBackend === 'auto' && this.preferWasm(),
    };
  }

  private applyInstallResult(result: InstallResult): void {
    if (result.status !== 'installed') return;
    this.disposeEmbedder();
    // A package/folder may carry its own model id (custom models); activate it
    // so `remove()` / `verify()` / the embedder loader look at the right folder.
    this.options.onModelInstalled?.(result.info.modelId);
    this.writePersisted({
      state: 'ready',
      modelId: result.info.modelId,
      reason: undefined,
      reasonCode: undefined,
      source: result.info.source,
      revision: result.info.revision,
      backend: result.backend,
      custom: result.info.custom,
      dims: result.info.dims,
      installedAt: result.info.installedAt,
    });
    this.options.onStateChange?.(this.getStatus());
  }

  // ── Download internals ────────────────────────────────────────────────────

  private async downloadFile(
    url: string,
    dest: string,
    expectedSize: number,
    signal: AbortSignal,
    fileName: string
  ): Promise<void> {
    const part = `${dest}.part`;
    let attempt = 0;
    while (attempt < DOWNLOAD_RETRIES) {
      attempt++;
      try {
        await this.downloadFileOnce(url, part, expectedSize, signal, fileName);
        fs.renameSync(part, dest);
        return;
      } catch (err) {
        if (signal.aborted) throw new ModelError('user_cancel', 'download cancelled');
        if (attempt >= DOWNLOAD_RETRIES) throw err;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
  }

  private async downloadFileOnce(
    url: string,
    part: string,
    expectedSize: number,
    signal: AbortSignal,
    fileName: string
  ): Promise<void> {
    let start = 0;
    if (fs.existsSync(part)) start = fs.statSync(part).size;
    if (expectedSize > 0 && start >= expectedSize) return; // already complete

    await new Promise<void>((resolve, reject) => {
      const request = net.request({ url, method: 'GET' });
      let settled = false;
      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(idle);
        if (err) reject(err);
        else resolve();
      };

      const idle = setTimeout(() => {
        try {
          request.abort();
        } catch {
          /* ignore */
        }
        finish(new ModelError('timeout', `download timed out: ${fileName}`));
      }, DOWNLOAD_IDLE_MS);

      const onAbort = (): void => {
        try {
          request.abort();
        } catch {
          /* ignore */
        }
        finish(new ModelError('user_cancel', 'download cancelled'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      if (start > 0) request.setHeader('Range', `bytes=${start}-`);

      request.on('error', (err) => finish(new ModelError('network', err.message || 'network error')));
      request.on('response', (response) => {
        const status = response.statusCode ?? 0;
        if (status !== 200 && status !== 206) {
          finish(new ModelError('network', `HTTP ${status} for ${fileName}`));
          (response as unknown as { resume?: () => void }).resume?.();
          return;
        }
        const append = status === 206 && start > 0;
        const total = expectedSize > 0 ? expectedSize : start + Number(response.headers['content-length'] ?? 0);
        let received = append ? start : 0;

        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          this.progress = { phase: 'download', file: fileName, receivedBytes: received, totalBytes: total };
          this.options.onProgress?.(this.progress);
        });

        const stream = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
        pipeline(response as unknown as NodeJS.ReadableStream, stream)
          .then(() => {
            if (expectedSize > 0 && fs.statSync(part).size !== expectedSize) {
              finish(new ModelError('network', `incomplete download for ${fileName}`));
              return;
            }
            finish();
          })
          .catch((err: Error) => finish(new ModelError('network', err.message || 'write failed')));
      });

      request.end();
    });
  }
}

function removeQuietly(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function mapReasonCode(err: unknown): GlossaryModelFailureReason {
  if (err instanceof ModelError) return toGlossaryReason(err.reason);
  const message = String(err instanceof Error ? err.message : err).toLowerCase();
  if (/enospc|disk/.test(message)) return 'disk_full';
  if (/sha|checksum|size mismatch/.test(message)) return 'checksum';
  return 'inference';
}

function toGlossaryReason(reason: ModelFailureReason): GlossaryModelFailureReason {
  return reason;
}
