// Background vector indexing job (design §2.5.6.4 / P2b-3).
//
// Encodes every glossary entry once (`passage: {en} | {zh_cn}`), stores the
// vector as a Float32 BLOB in `glossary_embeddings`, and keeps an in-memory
// `VectorIndex` in sync for fast top-k lookups.
//
// Properties required by the design:
//   - incremental: only rows whose `content_hash` changed are re-encoded
//   - resumable: progress lives in SQLite, so a restart continues where it left
//   - pausable: the batch loop yields between batches and checks the flag
//   - non-blocking: batches are small and `setImmediate` yields the event loop

import crypto from 'node:crypto';
import path from 'node:path';
import log from 'electron-log';
import { getDatabase } from '../storage/database';
import { VectorIndex } from './index/vector-index';
import {
  loadVectorSnapshot,
  saveVectorSnapshot,
  snapshotFingerprint,
} from './index/vector-snapshot';
import { blobToVector, vectorToBlob, type LocalEmbedder } from './embedding/local-embedder';
import type { GlossaryEmbeddingProgress, GlossarySettings } from '../../../shared/types/glossary.types';

interface EntryRow {
  id: string;
  en: string;
  zh_cn: string;
}

interface StoredVectorRow {
  entry_id: string;
  content_hash: string;
  vector: Buffer;
}

/** sha1 of the passage text; changes invalidate the stored vector. */
export function passageHash(en: string, zhCN: string): string {
  return crypto.createHash('sha1').update(`${en}|${zhCN}`).digest('hex');
}

/** Passage text encoded for an entry (bilingual index per §2.5.6.2). */
export function passageText(en: string, zhCN: string): string {
  return zhCN ? `${en} | ${zhCN}` : en;
}

export interface EmbeddingJobOptions {
  getSettings: () => GlossarySettings;
  getEmbedder: () => Promise<LocalEmbedder | null>;
  onProgress?: (progress: GlossaryEmbeddingProgress) => void;
  /** Directory for the persisted vector snapshot (P4-7). Omit to disable. */
  snapshotDir?: () => string | undefined;
}

export class GlossaryEmbeddingJob {
  private readonly index = new VectorIndex();
  private readonly indexedHashes = new Map<string, string>();
  private paused = false;
  private running = false;
  private loadedKey = '';
  private progress: GlossaryEmbeddingProgress = { done: 0, total: 0, failed: 0, running: false };
  private lastError: string | undefined;
  /** Fingerprint of the snapshot currently backed by `index` ('' = unknown). */
  private snapshotKey = '';

  constructor(private readonly options: EmbeddingJobOptions) {}

  /** In-memory vector index (entry ids → vectors). */
  get vectorIndex(): VectorIndex {
    return this.index;
  }

  getProgress(): GlossaryEmbeddingProgress {
    return { ...this.progress };
  }

  get error(): string | undefined {
    return this.lastError;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Drop cached vectors (glossary version or model changed). */
  invalidate(): void {
    this.index.clear();
    this.indexedHashes.clear();
    this.loadedKey = '';
    this.snapshotKey = '';
    this.progress = { done: 0, total: 0, failed: 0, running: this.running };
  }

  private currentKey(): string {
    const settings = this.options.getSettings();
    const dims = 0; // resolved after the embedder loads
    return `${settings.localEmbedding.modelId}:${dims}`;
  }

  /** Load all vectors for the configured model into the in-memory index. */
  async loadExisting(embedder: LocalEmbedder): Promise<void> {
    const settings = this.options.getSettings();
    const model = settings.localEmbedding.modelId;
    const key = `${model}:${embedder.dims}`;
    if (this.loadedKey === key) return;

    this.index.clear();
    this.indexedHashes.clear();
    try {
      const db = getDatabase();
      // Metadata first: it is tiny and lets a matching snapshot skip reading
      // tens of MB of BLOB rows (P4-7).
      const meta = db
        .prepare('SELECT entry_id, content_hash FROM glossary_embeddings WHERE model = ? AND dims = ?')
        .all(model, embedder.dims) as { entry_id: string; content_hash: string }[];
      const fingerprint = snapshotFingerprint(
        model,
        embedder.dims,
        meta.map((row) => ({ entryId: row.entry_id, contentHash: row.content_hash }))
      );

      const snapshotFile = this.snapshotFile(model, embedder.dims);
      if (settings.vectorSnapshot && snapshotFile) {
        const snapshot = loadVectorSnapshot(snapshotFile);
        if (snapshot && snapshot.fingerprint === fingerprint) {
          if (this.index.loadSnapshot(snapshot.ids, snapshot.data, snapshot.dims)) {
            for (const row of meta) this.indexedHashes.set(row.entry_id, row.content_hash);
            this.loadedKey = key;
            this.snapshotKey = fingerprint;
            log.info('[Glossary][Embedding] loaded vector snapshot', {
              entries: snapshot.ids.length,
              dims: snapshot.dims,
            });
            return;
          }
        }
      }

      const rows = db
        .prepare('SELECT entry_id, content_hash, vector FROM glossary_embeddings WHERE model = ? AND dims = ?')
        .all(model, embedder.dims) as StoredVectorRow[];
      for (const row of rows) {
        this.index.add(row.entry_id, blobToVector(row.vector));
        this.indexedHashes.set(row.entry_id, row.content_hash);
      }
      this.loadedKey = key;
      this.snapshotKey = '';
      log.info('[Glossary][Embedding] loaded stored vectors', { entries: rows.length, dims: embedder.dims });
      if (rows.length > 0) this.persistSnapshot(model, embedder.dims);
    } catch (err) {
      log.warn('[Glossary][Embedding] failed to load stored vectors:', err);
    }
  }

  /** Path of the snapshot file for one model/dims pair (undefined = disabled). */
  private snapshotFile(model: string, dims: number): string | null {
    const dir = this.options.snapshotDir?.();
    if (!dir) return null;
    return path.join(dir, `glossary-vectors-${model}-${dims}.bin`);
  }

  /** Write the current index to the snapshot file (best effort, never throws). */
  private persistSnapshot(model: string, dims: number): void {
    const file = this.snapshotFile(model, dims);
    if (!file || this.index.size === 0) return;
    try {
      const db = getDatabase();
      const meta = db
        .prepare('SELECT entry_id, content_hash FROM glossary_embeddings WHERE model = ? AND dims = ?')
        .all(model, dims) as { entry_id: string; content_hash: string }[];
      if (meta.length !== this.index.size) return; // index still incomplete
      const fingerprint = snapshotFingerprint(
        model,
        dims,
        meta.map((row) => ({ entryId: row.entry_id, contentHash: row.content_hash }))
      );
      saveVectorSnapshot(file, {
        dims,
        ids: this.index.getIds(),
        data: this.index.getData(),
        fingerprint,
      });
      this.snapshotKey = fingerprint;
    } catch (err) {
      log.warn('[Glossary][Embedding] failed to persist vector snapshot:', err);
    }
  }

  /**
   * Encode missing / outdated entries. Returns the final progress snapshot.
   * Safe to call repeatedly: already-indexed rows are skipped.
   */
  async run(): Promise<GlossaryEmbeddingProgress> {
    if (this.running) return this.getProgress();
    const embedder = await this.options.getEmbedder();
    if (!embedder) return this.getProgress();

    this.running = true;
    this.paused = false;
    this.lastError = undefined;
    const settings = this.options.getSettings();
    const model = settings.localEmbedding.modelId;
    const batchSize = settings.localEmbedding.runtimeBackend === 'wasm' ? 8 : 32;

    try {
      await this.loadExisting(embedder);
      const db = getDatabase();
      const rows = db
        .prepare('SELECT id, en, zh_cn FROM translation_mappings ORDER BY seq_no ASC, en ASC')
        .all() as EntryRow[];

      const pending: { row: EntryRow; hash: string }[] = [];
      for (const row of rows) {
        const hash = passageHash(row.en, row.zh_cn);
        if (this.indexedHashes.get(row.id) === hash) continue;
        pending.push({ row, hash });
      }

      this.updateProgress({ done: rows.length - pending.length, total: rows.length, failed: 0, running: true });
      if (pending.length === 0) return this.getProgress();

      const insert = db.prepare(
        `INSERT OR REPLACE INTO glossary_embeddings (entry_id, model, dims, content_hash, vector)
         VALUES (?, ?, ?, ?, ?)`
      );

      let done = rows.length - pending.length;
      let failed = 0;
      for (let offset = 0; offset < pending.length; offset += batchSize) {
        if (this.paused) break;
        const batch = pending.slice(offset, offset + batchSize);
        try {
          const vectors = await embedder.embed(
            batch.map(({ row }) => passageText(row.en, row.zh_cn)),
            'passage'
          );
          const transaction = db.transaction(() => {
            batch.forEach(({ row, hash }, index) => {
              const vector = vectors[index];
              if (!vector) return;
              insert.run(row.id, model, embedder.dims, hash, vectorToBlob(vector));
            });
          });
          transaction();
          batch.forEach(({ row, hash }, index) => {
            const vector = vectors[index];
            if (!vector) return;
            this.indexedHashes.set(row.id, hash);
            this.index.add(row.id, vector);
          });
          done += batch.length;
        } catch (err) {
          failed += batch.length;
          this.lastError = err instanceof Error ? err.message : String(err);
          log.warn('[Glossary][Embedding] batch failed:', this.lastError);
        }
        this.updateProgress({ done, total: rows.length, failed, running: true });
        // Yield so L1–L3 queries keep their latency and the UI stays responsive.
        await new Promise((resolve) => setImmediate(resolve));
      }

      this.updateProgress({ done, total: rows.length, failed, running: false });
      if (failed === 0) this.persistSnapshot(model, embedder.dims);
      log.info('[Glossary][Embedding] indexing finished', { done, total: rows.length, failed });
      return this.getProgress();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      log.warn('[Glossary][Embedding] job failed:', this.lastError);
      this.updateProgress({ ...this.progress, running: false });
      return this.getProgress();
    } finally {
      this.running = false;
    }
  }

  private updateProgress(next: GlossaryEmbeddingProgress): void {
    this.progress = next;
    this.options.onProgress?.(this.getProgress());
  }
}
