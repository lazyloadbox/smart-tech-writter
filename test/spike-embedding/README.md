# spike-embedding — P0-5 本地 embedding 技术验证

设计文档 §2.5.6.5 的 spike 实现。结论与实测数据见
[`docs/design/p0-5-embedding-spike-report.md`](../../docs/design/p0-5-embedding-spike-report.md)。

| 文件 | 作用 |
|---|---|
| `download-model.mjs` | 下载并校验模型（`--variant quantized\|fp16\|fp32`、`--mirror`、`--force`），写 `installed.json`；首次运行生成 `model-manifest-<variant>.json` 作为可信 SHA-256 清单 |
| `tokenizer.mjs` | 纯 JS XLM-R 分词器（Precompiled charsmap + Metaspace + Unigram Viterbi） |
| `embed.mjs` | `Embedder`：原生 / WASM 双后端、mean pooling、L2 归一化、`auto` 回退策略、完整性检查 |
| `spike.mjs` | 性能、内存、后端一致性、失败降级、go/no-go 判定（每后端独立子进程测量） |
| `quality.mjs` | L4 检索质量：整句 vs 短候选 × 单语/双语索引，输出 R@1/3/5/10 |
| `tokenizer-reference.mjs` | 与官方 `tokenizers`（Rust）逐 id 对比 |
| `electron-main.mjs` / `electron-worker.mjs` | Electron `worker_threads` 内的推理验证 |
| `packaged-check.mjs` | 打包产物检查：`app.asar` 路径 `require` + 原生/WASM 推理 + 资源体积 |

## 快速开始

```powershell
node test/spike-embedding/download-model.mjs
node test/spike-embedding/spike.mjs --threads 4
node test/spike-embedding/quality.mjs --passage-format en-zh
```

模型与结果目录（`models/`、`results/`、`electron-zip/`）均在 `.gitignore` 中，不会入库。
