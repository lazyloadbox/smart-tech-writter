import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native / WASM runtimes must stay external: Rollup cannot bundle a
      // `.node` binary, and the WASM backend has to be required through its
      // CommonJS entry (Electron's ESM loader cannot read modules in app.asar).
      external: ['better-sqlite3', 'electron', 'onnxruntime-node', 'onnxruntime-web'],
    },
  },
});

