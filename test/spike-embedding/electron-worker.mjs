// Worker half of the P0-5 Electron check. Runs the same embedder the production
// glossary worker will use and reports vectors + resource figures to the main
// process.

import { parentPort, workerData } from 'node:worker_threads';
import { createEmbedder, cosine, defaultWasmDir } from './embed.mjs';

const rssMb = () => process.memoryUsage().rss / 1024 / 1024;

async function run() {
  const rssBefore = rssMb();
  const embedder = await createEmbedder({
    backend: workerData.backend,
    modelDir: workerData.modelDir,
    threads: workerData.threads,
    wasmDir: defaultWasmDir(),
  });

  const started = performance.now();
  const result = await embedder.embed(['duty cycle', '占空比', 'dead time'], { kind: 'passage' });
  const embedMs = performance.now() - started;

  parentPort.postMessage({
    ok: true,
    backend: embedder.backend,
    loadMs: embedder.loadMs,
    embedMs,
    dims: result.dims,
    cosineDutyCycleZh: cosine(result.vectors[0], result.vectors[1]),
    rssBeforeMb: rssBefore,
    rssAfterMb: rssMb(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  });

  await embedder.dispose?.();
}

run().catch((err) => {
  parentPort.postMessage({ ok: false, backend: workerData.backend, error: String(err?.stack ?? err) });
});
