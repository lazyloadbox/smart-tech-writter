import { defineConfig } from 'vite';
import path from 'node:path';

const root = process.cwd();

// SSR build mode keeps Node builtins (stream, crypto, path, ...) as proper
// external requires instead of browser shims — required for the mailparser /
// mammoth / @langchain dependency tree to load in Electron's main process.
export default defineConfig({
  build: {
    ssr: true,
    rollupOptions: {
      input: path.join(root, 'test/langgraph/integration-test.ts'),
      output: {
        format: 'cjs',
        entryFileNames: 'integration-test.js',
      },
      // Native / Electron modules stay external (resolved at runtime).
      external: ['electron', 'better-sqlite3'],
    },
    outDir: path.join(root, 'test/langgraph/dist'),
    emptyOutDir: true,
  },
  // Bundle ESM-only deps (@langchain/*, etc.) into the CJS output so they
  // don't hit ERR_REQUIRE_ESM at runtime.
  ssr: {
    noExternal: true,
  },
});