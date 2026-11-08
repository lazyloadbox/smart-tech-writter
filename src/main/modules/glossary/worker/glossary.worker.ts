// Glossary matching worker (design §2.5.10 / P2a-3).
//
// Runs the L1–L3 index build and document scans off the Electron main thread
// so large glossaries never stall IPC or the UI. The main process talks to it
// through `worker/client.ts` over `worker_threads` messages.

import { parentPort } from 'node:worker_threads';
import {
  GlossaryIndex,
  type GlossaryIndexRow,
  type GlossaryMatch,
  type GlossaryScanOptions,
} from '../index/glossary-index';

/** Messages sent from the client to this worker. */
type WorkerRequest =
  | { type: 'build'; id: number; rows: GlossaryIndexRow[] }
  | { type: 'match'; id: number; text: string; options: GlossaryScanOptions }
  | { type: 'stats'; id: number }
  | { type: 'dispose' };

/** Messages sent back to the client. */
export type GlossaryWorkerResponse =
  | { type: 'result'; id: number; ok: true; result: unknown }
  | { type: 'result'; id: number; ok: false; error: string };

let index: GlossaryIndex | null = null;

function handle(request: WorkerRequest): GlossaryWorkerResponse | null {
  switch (request.type) {
    case 'build': {
      const startedAt = Date.now();
      index = new GlossaryIndex(request.rows);
      return {
        type: 'result',
        id: request.id,
        ok: true,
        result: { entries: index.size, elapsedMs: Date.now() - startedAt },
      };
    }
    case 'match': {
      if (!index) {
        return { type: 'result', id: request.id, ok: false, error: 'Index not built' };
      }
      const matches: GlossaryMatch[] = index.match(request.text, request.options);
      return { type: 'result', id: request.id, ok: true, result: matches };
    }
    case 'stats': {
      return { type: 'result', id: request.id, ok: true, result: { entries: index?.size ?? 0 } };
    }
    case 'dispose':
      index = null;
      return null;
  }
}

if (parentPort) {
  parentPort.on('message', (request: WorkerRequest) => {
    try {
      const response = handle(request);
      if (response) parentPort?.postMessage(response);
      if (request.type === 'dispose') process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if ('id' in request) {
        parentPort?.postMessage({ type: 'result', id: request.id, ok: false, error: message });
      }
    }
  });
}
