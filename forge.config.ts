import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    // Offline packaging escape hatch: point this at a folder containing
    // electron-v<version>-<platform>-<arch>.zip when the Electron download is
    // blocked (corporate proxy / GitHub 5xx). Undefined in normal builds.
    ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
    asar: {
      // onnxruntime loads its DLLs next to the binding, and the WASM backend
      // resolves `ort-wasm-simd-threaded.mjs`/`.wasm` by URL next to each other.
      // Both must live outside app.asar: Electron cannot dlopen from asar and its
      // ESM loader cannot read asar at all.
      unpack: '**/{*.node,*.dll,onnxruntime-web/dist/*}',
    },
    // Vite 插件默认的 ignore 只打包 `.vite` 目录，会把 node_modules 整个排除，
    // 导致运行时 require('better-sqlite3') 报 "Cannot find module"。
    // 这里覆盖 ignore：保留 .vite 构建产物 + package.json + node_modules（生产依赖），
    // 打包后 electron-forge 会自动 prune 掉 devDependencies。
    ignore: (file: string) => {
      if (!file) return false; // 根目录
      if (file.startsWith('/.vite')) return false; // Vite 构建产物（main/preload/renderer）
      if (file === '/package.json') return false; // package.json

      // Only ship the Windows x64 ONNX Runtime binary; the package ships every
      // platform + DirectML (GPU) DLLs, which we do not use.
      // NOTE: packager prunes whole sub-trees when a *directory* is ignored, so
      // every ancestor of the win32/x64 folder must stay in the keep chain.
      if (file.startsWith('/node_modules/onnxruntime-node/bin')) {
        const winX64 = '/node_modules/onnxruntime-node/bin/napi-v6/win32/x64';
        const inKeepChain = winX64.startsWith(file) || file === winX64 || file.startsWith(`${winX64}/`);
        if (!inKeepChain) return true;
        if (file.endsWith('/DirectML.dll') || file.endsWith('/dxcompiler.dll')) return true;
        return false;
      }
      // Only keep the SIMD-threaded WASM runner used by the compatibility mode.
      if (/^\/node_modules\/onnxruntime-web\/dist\/ort-wasm-simd-threaded\.(asyncify|jsep|jspi)\.(wasm|mjs)$/.test(file)) {
        return true;
      }

      if (file.startsWith('/node_modules')) return false; // 生产依赖（含 better-sqlite3 / onnxruntime）
      return true; // 其余（src/test/docs/out 等）全部忽略
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    // 原生模块（better-sqlite3 的 .node 文件）解包到 app.asar.unpacked，否则无法从 asar 内加载
    new AutoUnpackNativesPlugin(),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          // Glossary matching worker thread (P2a). Emitted as
          // `.vite/build/glossary.worker.js`, next to the main bundle.
          entry: 'src/main/modules/glossary/worker/glossary.worker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
