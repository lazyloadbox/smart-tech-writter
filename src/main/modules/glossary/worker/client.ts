// Main-process client for the glossary worker (design §2.5.10 / P2a-3).
//
// Falls back to running the same index in-process when the worker cannot be
// created (unit tests, a broken build, or a restricted environment). Callers
// therefore never fail because of worker availability — they only lose the
// "does not block the event loop" property.

import path from 'node:path';
import { Worker } from 'node:worker_threads';
import log from 'electron-log';
import {
  GlossaryIndex,
  type GlossaryIndexRow,
  type GlossaryMatch,
  type GlossaryScanOptions,
} from '../index/glossary-index';
import type { GlossaryWorkerResponse } from './glossary.worker';

/** Worker calls time out after this long (design §2.5.6.7: 30 s). */
const WORKER_TIMEOUT_MS = 30_000;

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class GlossaryWorkerClient {
  private worker: Worker | null = null;
  private workerBroken = false;
  private readonly pending = new Map<number, PendingCall>();
  private nextId = 1;

  /** In-process mirror used for fallback and synchronous callers. */
  private inlineIndex: GlossaryIndex | null = null;
  private inlineRows: GlossaryIndexRow[] = [];

  /** `worker` when running in a worker thread, `inline` after a fallback. */
  get mode(): 'worker' | 'inline' {
    return this.worker && !this.workerBroken ? 'worker' : 'inline';
  }

  /** Build (in-process) and return the entry count. */
  buildInline(rows: GlossaryIndexRow[]): number {
    this.inlineRows = rows;
    this.inlineIndex = new GlossaryIndex(rows);
    return this.inlineIndex.size;
  }

  /** Build the index in the worker. Returns the entry count. */
  async build(rows: GlossaryIndexRow[]): Promise<number> {
    // Always keep the inline mirror current so `matchSync` works and so a
    // worker failure can continue without a rebuild.
    this.buildInline(rows);
    const worker = this.ensureWorker();
    if (!worker) return this.inlineIndex?.size ?? 0;
    try {
      const result = (await this.call(worker, { type: 'build', rows })) as { entries?: number };
      return result?.entries ?? this.inlineIndex?.size ?? 0;
    } catch (err) {
      this.disableWorker(err);
      return this.inlineIndex?.size ?? 0;
    }
  }

  /** Match using the worker, falling back to the inline index. */
  async match(text: string, options: GlossaryScanOptions): Promise<GlossaryMatch[]> {
    const worker = this.ensureWorker();
    if (!worker) return this.matchSync(text, options);
    try {
      return (await this.call(worker, { type: 'match', text, options })) as GlossaryMatch[];
    } catch (err) {
      this.disableWorker(err);
      return this.matchSync(text, options);
    }
  }

  /** Synchronous match against the in-process mirror. */
  matchSync(text: string, options: GlossaryScanOptions): GlossaryMatch[] {
    return this.inlineIndex ? this.inlineIndex.match(text, options) : [];
  }

  /** In-process index accessor (used by the resolver for entry lookups). */
  getIndex(): GlossaryIndex | null {
    return this.inlineIndex;
  }

  get rows(): GlossaryIndexRow[] {
    return this.inlineRows;
  }

  dispose(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'dispose' });
      } catch {
        /* ignore */
      }
      void this.worker.terminate().catch((): void => undefined);
      this.worker = null;
    }
    for (const [, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject(new Error('Glossary worker disposed'));
    }
    this.pending.clear();
    this.inlineIndex = null;
    this.inlineRows = [];
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private ensureWorker(): Worker | null {
    if (this.worker && !this.workerBroken) return this.worker;
    if (this.workerBroken) return null;
    try {
      // Forge's Vite build emits the worker next to the main bundle.
      const workerPath = path.join(__dirname, 'glossary.worker.js');
      const worker = new Worker(workerPath);
      worker.on('message', (msg: GlossaryWorkerResponse) => this.onMessage(msg));
      worker.on('error', (err) => this.disableWorker(err));
      worker.on('exit', (code) => {
        if (code !== 0) this.disableWorker(new Error(`Glossary worker exited with code ${code}`));
      });
      worker.unref?.();
      this.worker = worker;
      log.info('[Glossary] worker started');
      return worker;
    } catch (err) {
      this.disableWorker(err);
      return null;
    }
  }

  private disableWorker(err: unknown): void {
    if (!this.workerBroken) {
      log.warn('[Glossary] worker unavailable, falling back to in-process matching:', err);
    }
    this.workerBroken = true;
    if (this.worker) {
      void this.worker.terminate().catch((): void => undefined);
      this.worker = null;
    }
    for (const [, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject(new Error('Glossary worker unavailable'));
    }
    this.pending.clear();
  }

  private onMessage(msg: GlossaryWorkerResponse): void {
    const call = this.pending.get(msg.id);
    if (!call) return;
    this.pending.delete(msg.id);
    clearTimeout(call.timer);
    if (msg.ok) call.resolve(msg.result);
    else call.reject(new Error('error' in msg ? msg.error : 'Glossary worker failed'));
  }

  private call(worker: Worker, payload: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Glossary worker timed out'));
      }, WORKER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ ...payload, id });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
