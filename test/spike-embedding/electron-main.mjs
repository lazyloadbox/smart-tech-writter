// Electron worker-thread check for P0-5: the embedding stack must work inside
// the `worker_threads` context the production GlossaryWorker will use
// (design §2.5.10), for both the native and the WASM backend.
//
//   npx electron test/spike-embedding/electron-main.mjs
//   $env:SPIKE_BACKEND='wasm'; npx electron test/spike-embedding/electron-main.mjs

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const backend = process.env.SPIKE_BACKEND ?? 'native';
  const threads = Number(process.env.SPIKE_THREADS ?? 4);
  const modelDir = path.resolve(HERE, 'models', 'multilingual-e5-small-int8');
  const worker = new Worker(path.join(HERE, 'electron-worker.mjs'), {
    workerData: { backend, modelDir, threads },
  });

  try {
    const result = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error(`worker exited with code ${code}`));
      });
    });

    fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
    fs.writeFileSync(
      path.join(HERE, 'results', `electron-${backend}-t${threads}.json`),
      JSON.stringify(result, null, 2) + '\n',
      'utf-8',
    );
    console.log(`[electron ${backend} t${threads}]`, JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error('[electron] worker failed:', err);
    app.exit(1);
  }
});
