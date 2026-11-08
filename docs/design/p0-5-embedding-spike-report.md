# P0-5 技术验证报告：本地 embedding（ONNX）可行性

> 日期：2026-11-08 · 对应设计文档 §2.5.6.5 的 go / no-go 标准
> 结论：**GO** —— 本地语义层（L4）在本版本可实现，但需按下文修订 4 处指标与 3 处实现细节。
> 复现脚本与原始结果：`test/spike-embedding/`（模型文件不入库，见 `.gitignore`）

## 1. 验证环境

| 项 | 值 |
|---|---|
| OS / CPU | Windows x64 · 24 逻辑核 · 64 GB RAM |
| 运行时 | Node v24.14.0（独立进程）、Electron 42.4.1 / Node 24.16 / Chromium 148（worker 内） |
| 原生后端 | `onnxruntime-node` 1.31.1（`bin/napi-v6/win32/x64`） |
| 兼容后端 | `onnxruntime-web` 1.31.1（`ort-wasm-simd-threaded.{mjs,wasm}`） |
| 模型 | `Xenova/multilingual-e5-small` · `model_quantized.onnx`（118.3 MB）+ `tokenizer.json`（17.1 MB）<br>对比模型：`model_fp16.onnx`（235 MB） |
| 分词器 | 自研纯 JS XLM-R Unigram（`tokenizer.mjs`，含 SentencePiece Precompiled charsmap 解码） |

## 2. 结论速览

| 检查项（§2.5.6.5） | 目标 | 实测（原生） | 实测（兼容/WASM） | 判定 |
|---|---|---|---|---|
| 模型加载 | ≤ 3 s | 344 ms | 502 ms | ✅ |
| 单条短文本推理 | ≤ 20 ms（原生）/ ≤ 60 ms（WASM 目标） | 1.8 ms（P50 1.9） | 4.5 ms（P50 4.4） | ✅ |
| 5k 条建索引 | ≤ 3 min（原生）/ ≤ 8 min（WASM） | ≈ 5.3 s（按 batch32 外推） | ≈ 20.9 s | ✅ |
| 进程峰值 RSS | ≤ 400 MB | 367 MB | 283 MB（Node 单进程） | ✅（原生）<br>⚠ 兼容模式见 §5 |
| 向量一致性 | 余弦 ≥ 0.999 | 最小 0.998634 / 平均 0.999890 | — | ⚠ 修订为 ≥ 0.995 + 候选互换性（§6） |
| 分词器对齐 | 与参考实现一致 | `tokenizers@0.23.2` 逐 id 对比 **290/290 完全一致** | — | ✅ |
| 打包（forge package） | 干净机器可加载并推理 | 原生从 `app.asar` 加载 + 推理 230 ms | WASM 从 `app.asar` 加载 + 推理 405 ms | ✅ |
| 安装包增量 | ≤ 40 MB | 解包 44.8 MB，压缩后 **15.2 MB** | — | ✅（需裁掉非 win-x64 与多余 wasm） |
| 效果（L4 增量） | 概念级召回 +3pp | 见 §7：概念条目 R@5 从 0 → 100% | — | ✅ |
| 失败降级 | 任何失败不影响流程 | 5 类失败模拟全部通过 | — | ✅ |

## 3. Tokenizer（纯 JS，无原生依赖）

- 实现内容：`Precompiled(charsmap)` → `Replace(/ {2,}/ → " ")` → `Metaspace(▁)` → Unigram Viterbi → `<s> … </s>`。
- charsmap 为 base64 编码的 Darts-clone 双数组 trie（trie 177,152 B + 替换串 60,383 B），直接解码，无第三方依赖。
- 与官方 `tokenizers`（Rust 绑定）对比 290 条覆盖：英文、简中、全角、重音、希腊/俄文、emoji、零宽字符、NBSP、多空格、换行/制表符、4 份评测材料全文 —— **id 序列 290/290 一致**。
- 结论：**不需要** `@huggingface/transformers`（它还会带入 `sharp` 与另一份 ORT），P2b 可直接采用这套约 260 行实现。

## 4. 性能与内存（每后端独立子进程测量）

| 指标 | 原生 | 兼容（WASM，Node） |
|---|---|---|
| 加载 | 344 ms | 502 ms |
| 单条平均 / P50 / 最大 | 1.8 / 1.9 / 3.1 ms | 4.5 / 4.4 / 6.2 ms |
| batch=16 单次 | — | — |
| batch=32 单次 | 34 ms（1.1 ms/条） | 134 ms（4.2 ms/条） |
| 5k 建索引（外推） | 5.3 s | 20.9 s |
| RSS 峰值 | 367 MB | 283 MB |

Electron `worker_threads` 内复测（`electron-main.mjs`）：

| 后端 | 加载 | 单条 | worker RSS（加载后） |
|---|---|---|---|
| 原生 | 523 ms | ~5.8 ms/条（3 条一批 17 ms） | 289 MB |
| WASM（4 线程） | 604 ms | ~14 ms/条 | 813 MB |
| WASM（2 线程） | 365 ms | ~14.5 ms/条 | 794 MB |
| WASM（1 线程） | 377 ms | ~16 ms/条 | 648 MB |

## 5. 关键发现：WASM 的内存预算

- 兼容模式在 Electron worker 中占用 **648–813 MB**，主要来自 WASM 线性内存增长，与线程数关系不大；Node 单进程测得 283 MB 是因为统计口径与分配器不同。
- 设计中的「worker 峰值 ≤ 400 MB」应**只适用于原生后端**。兼容模式定位为“原生不可用时的兜底”，建议：
  1. 单线程（`numThreads = 1`）并显式限流（设计 §2.5.6.8 已要求）；
  2. 空闲卸载时**终止 worker 并重建**（`session.release()` 不会归还 WASM 内存）；
  3. 设置页模型卡片显示“本次会话内存占用较高”的提示，不做硬性阻断。

## 6. 后端一致性：修订阈值

- 同一输入下 16 条样本文本：最小余弦 **0.998634**、平均 **0.999890**（设计文字要求 ≥ 0.999）。
- 1.31 的 int8 量化在不同执行后端使用不同 kernel，逐位一致不可得；但**检索候选互换性**很好：
  - 原生 top-1 落在 WASM top-5 的比例：**100%**
  - WASM top-1 落在原生 top-5 的比例：**98.0%**（49 条 query）
  - 原始 top-1 完全一致率 85.7%（差异集中在 `Resolution`/`Register map` 这类高度近义的条目上，属等价候选）
- 建议把 §2.5.6.8 的判定改为：**余弦 ≥ 0.995 且 top-1↔top-5 候选互换性 ≥ 95%**；切换后端不重建索引依然成立。

## 7. 效果：L4 到底补了多少

评测集：`test/glossary-eval/`（111 条术语、4 份材料、66 条标注期望，其中 4 条为概念级）。
索引 = 术语条目，查询 = 两种口径（整句 / 短候选词，后者等价于 L5a 的输出）。

| 查询口径 | 索引文本 | R@1 | R@3 | R@5 | 概念级 R@1/R@5 |
|---|---|---|---|---|---|
| 整句 | `en` | 35% | 62% | 70% | 75% / 100% |
| 整句 | `en \| zh-CN` | 29% | 47% | 53% | 50% / 75% |
| 短候选词 | `en` | 77% | 91% | 91% | 25% / 75% |
| **短候选词** | **`en \| zh-CN`** | **91%** | **98%** | **100%** | 25% / **100%** |

- **必须**用短文本查询（整句查询会把概念稀释，出现 `占空比设为 50%` → `Zero-crossing` 这类误召回），这与设计 §2.5.6.4 的判断一致。
- 索引文本采用设计 §2.5.6.2 的双语形式 `passage: {en} | {zh_cn}` 后，短查询 R@5 从 91% 提升到 100%，中文查询能直接命中英文条目。
- 概念级（L1/L2 完全无法召回）的 4 条在双语索引 + 短查询下 R@5 = 100%，即 **L4 对概念级召回有实质增量（0/4 → 4/4）**，满足“≥ 3pp”的效果门槛（评测集整体 +6.1pp）。
- int8 与 fp16 质量对比：fp16（235 MB）短查询 R@1 76% / R@5 88%，**int8 反而略优**；选择 int8（118 MB）。

## 8. 打包验证（Electron Forge）

`npm run package` 产物实测（`test/spike-embedding/packaged-check.mjs`，在 Electron 中从 `app.asar` 路径 `require`）：

| 检查 | 结果 |
|---|---|
| `onnxruntime_binding.node` / `onnxruntime.dll` 位于 `app.asar.unpacked` | ✅ |
| `ort-wasm-simd-threaded.{wasm,mjs}` 位于 `app.asar.unpacked` | ✅ |
| 原生后端从 asar 路径加载并推理 | ✅ 230 ms |
| 兼容后端从 asar 路径加载并推理 | ✅ 405 ms |
| 打包内两后端向量余弦 | 1.000000（同输入同路径） |
| 解包资源体积 | 44.8 MB（binding 0.3 + dll 30.3 + wasm 14.2 + mjs 0.0） |
| 压缩后增量（deflate 估计） | **15.2 MB** |

必须遵守的三条打包规则（已在 `forge.config.ts` 落地）：

1. `asar.unpack` 必须包含 `onnxruntime-web/dist/*`：`ort-wasm-simd-threaded.mjs` 要和 `.wasm` 相邻，且 **Electron 的 ESM loader 无法读取 asar**；生产代码必须用 `require('onnxruntime-web')`（CJS 入口），不要用 `import()`。
2. `ignore` 只保留 `bin/napi-v6/win32/x64` 与 `ort-wasm-simd-threaded.*`，并剔除 `DirectML.dll` / `dxcompiler.dll`。**注意**：packager 在忽略目录时会剪掉整棵子树，所以 win32/x64 的**所有祖先目录**必须保留（首版配置因此丢失了全部原生二进制）。
3. ORT 1.31 的目录是 `bin/napi-v6`（不是旧版的 `napi-v3`），打包断言不要写死旧路径。

> 环境备注：本机访问 GitHub Releases 返回 504，`npm run package` 会因 Electron 下载失败。通过 `ELECTRON_ZIP_DIR`（`forge.config.ts` 中的可选环境变量）指向本地 `electron-v42.4.1-win32-x64.zip` 可离线打包；正常网络下无需设置。

## 9. 失败降级验证

| 场景 | 结果 |
|---|---|
| 模型目录缺失 / 文件缺失 | 抛出明确错误（`no ONNX model found …`），进程不崩溃 |
| 模型文件被截断（1/3） | `InferenceSession.create` 失败并抛出 |
| `installed.json` 记录的尺寸与实际不符 | 完整性检查报错（`size … does not match`） |
| 原生运行时加载失败 + `auto` 策略 | 自动切换 WASM，记录原因，向量仍为 384 维 |
| `native` 强制策略 | 失败即抛出（不静默降级） |

P2b 还需补：下载中断续传、zip 安全解压、校验失败清理、推理超时熔断（本次已验证错误可捕获，熔断逻辑属实现阶段）。

## 10. 对 P2b 的实施建议（结论性清单）

1. 采用 **`multilingual-e5-small` int8（384 维）+ 自研纯 JS 分词器**；索引文本为 `passage: {en} | {zh_cn}`，查询只接受短候选（术语/短语/句子条目本身）。
2. 首次运行下载的模型清单按 `model-manifest-quantized.json` 的 SHA-256 固化为内置 allow-list。
3. `runtimeBackend=auto`：原生优先；失败切换 WASM 并把原因写 `settings['glossary.model.nativeFailedAt']`。
4. 兼容模式固定 `numThreads=1`（内存 648 MB @1 线程 vs 813 MB @4 线程），并复用设计 §2.5.6.8 的限流参数；空闲卸载时**结束 worker**。
5. 打包规则见 §8，并把 `packaged-check.mjs` 的断言纳入发布前检查（可做成 CI 步骤）。
6. 阈值标定：相似度分布整体偏高（0.83–0.91），设计中的 `0.88/0.84` 初值需要按 bilingual-index 实测重新标定（建议以本次 R@1=91%/R@5=100% 为参照，先取候选 0.86 / 灰区 0.82 再微调）。
7. 评测脚本 `npm run eval:glossary` 已就绪；P2a 完成后在同一评测集上输出各层召回，作为回归门禁。

## 11. 复现命令

```powershell
# 1) 下载模型（模型不入库；可加 --variant fp16 做质量对比）
node test/spike-embedding/download-model.mjs

# 2) 性能 + 失败降级 + 一致性（原生 / WASM）
node test/spike-embedding/spike.mjs --threads 4

# 3) 分词器与官方实现逐 id 对比（参考实现装在项目外）
$ref = "$env:TEMP\stw-tokenizers-ref"; npm i --prefix $ref tokenizers@0.23.2
node test/spike-embedding/tokenizer-reference.mjs --ref $ref

# 4) L4 质量（整句 / 短候选 × 单语 / 双语索引）
node test/spike-embedding/quality.mjs --passage-format en
node test/spike-embedding/quality.mjs --passage-format en-zh

# 5) Electron worker 内推理
npx electron test/spike-embedding/electron-main.mjs
$env:SPIKE_BACKEND='wasm'; npx electron test/spike-embedding/electron-main.mjs

# 6) 打包产物检查
npm run package
npx electron test/spike-embedding/packaged-check.mjs --resources=out/smart-tech-writter-win32-x64/resources
```

原始输出：`test/spike-embedding/results/`（gitignored）。
