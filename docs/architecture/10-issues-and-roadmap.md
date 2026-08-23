# 10 — 已知问题、风险与演进路线

> 基于源码事实与仓库维护记录整理，供重构/迭代决策参考。

## 10.1 已知问题与风险（按严重度）

### 🔴 高

| # | 问题 | 事实依据 | 影响 |
|---|---|---|---|
| R1 | **~~RAG 是关键词搜索，非语义检索~~（已修复 2026-08-22）** | `SemanticSearchService` 用 `provider.embed()` 建向量索引（`rag_chunks` 表），`rag:addDocument` 落地为真实索引写入；无索引/embed 失败时回退 `LocalSearchService` 关键词搜索 | 参考资料召回质量差，无法发现语义相关但词面不同的文档 |
| R2 | **~~大文档上下文截断严重~~（已修复 2026-08-22）** | FileParser/Analyzer 改用 `summarizeLongText` 分块 map-reduce（chunk 4000/overlap 200/上限 20 段均匀采样）替代硬截断；RAG 索引按 chunk 全文检索 | 长文档关键信息丢失，分析/草稿质量随文件变大而下降 |
| R3 | **API Key 明文存储** | settings 表直接存 `openai.apiKey` 字符串 | 密钥泄露风险（建议 Electron `safeStorage` 加密） |
| R4 | **~~`file:read` 无路径范围校验~~（已修复 2026-08-22）** | `PathGuard` 白名单：仅允许对话框/工作流启动时用户选中的文件 + `userData/projects` + RAG 搜索目录，且扩展名限文本/代码 | 若渲染进程被注入，可读取任意系统文本文件 |
| R5 | **无测试套件** | 未安装任何测试框架；`test/` 仅含 2 个样例输入文件 | 20 阶段流水线与匹配算法回归风险高（ReviewPanel 曾反复出 bug） |

### 🟡 中

| # | 问题 | 事实依据 |
|---|---|---|
| M1 | **~~单草稿假设贯穿全链路~~（已修复 2026-08-22）** | `WriterAgent` 按分析文件产出多篇草稿（标题含源文件名）；`humanEditedDrafts` 按草稿粒度保存人工编辑，`humanEdits` 仅套用到 drafts[0]；ReviewPanel 提交完整 editedDrafts 数组，UI 不再只取 drafts[0]。**2026-08-22 再调整**：按用户需求改回「多文件 → 一份综合文档」——`WriterAgent` 把全部 analysisResults 合并为 1 篇「综合技术文档」，多草稿基础设施（humanEditedDrafts / ReviewPanel 数组）保留以兼容单篇 |
| M2 | **~~DOCX/PDF 出口休眠~~（已修复 2026-08-22，DOCX 部分）** | `runExportStage` 每篇文档同时导出 `.dita` + `.docx`（`buildDocx` 接入）；`file:saveDita` 按格式选择保存对话框过滤器；PDF 仍无构建器，`format:'pdf'` 保留待后续 |
| M3 | **~~`workflow:pause` 仍是空实现~~（已修复 2026-08-22）** | `pauseWorkflow` 用 AbortController 中止在途 invoke（AbortSignal 已贯穿 provider/agent/map-reduce），置 `PAUSED:USER`；`resumeWorkflow` 从检查点继续；UI 增加暂停/继续按钮 |
| M4 | **~~回退不取消已发出的 AI 请求~~（已修复 2026-08-22）** | LangGraph 迁移后 `goBackToStage` 用 `AbortController` 中止在途 invoke，再重放目标检查点；旧请求仍会消耗 token 但结果被丢弃 |
| M5 | **~~引擎绑定单窗口~~（已修复 2026-08-22）** | `WorkflowEngine` 构造不再持 `mainWindow`；`WorkflowEmitterImpl` 与 `emitStream` 改为向 `BrowserWindow.getAllWindows()` 广播；状态持久化在 `langgraph.db` 检查点 + `projects.state_json` 镜像，重启后 `getState` 可恢复 |
| M6 | **~~AI 评论解析失败降级有损~~（已修复 2026-08-22）** | ReviewerAgent 增加一次修复重试（要求 AI 只输出修正后的 JSON 数组）；`normalizeComments` 后端校验/归一化 `draftId`（按 originalText 内容匹配或按索引回退），前端 `normalizeComments` 仍作兜底 |
| M7 | **~~`ingest` 阶段是计数空壳~~（已修复 2026-08-22）** | `runIngestStage` 汇总就绪文件为 `ingestContext`（元数据 + AI 摘要 + 提取文本）；AnalyzerAgent 优先使用 `ingestContext`，避免重复读取/摘要 |
| M8 | **~~DITA 构建器无格式校验~~（已修复 2026-08-22）** | `dita.builder` 新增 `validateDitaXml`（XML 声明/单根/标签配对/未转义字符检查）；`runDitaBuildStage` 与 `runExportStage` 构建后校验并输出警告 |
| M9 | **~~DITA 审查阶段无流式结构化展示~~（已修复 2026-08-22）** | `AIStreamViewer` 的 `aiStages`、`STAGE_LABELS`、`STAGE_DESCRIPTIONS` 已加入 `dita_ai_review` |

### 🟢 低（整洁度/一致性）

| # | 问题 | 事实依据 |
|---|---|---|
| L1 | **~~未使用的 LangChain 依赖~~（已投入使用 2026-08-22）** | `@langchain/langgraph` + `@langchain/langgraph-checkpoint-sqlite` 已用于工作流编排与检查点持久化；`@langchain/openai` 仍未使用（AI 调用层保留自研 `AIProvider`） |
| L2 | **react-query 仅做包装** | 只挂了 `QueryClientProvider`，无任何查询/变更调用 |
| L3 | **Forge 模板残留文件** | `src/main.ts`、`src/renderer.ts` 为模板样板，未被构建引用（真实入口是 `src/main/index.ts` 与 `renderer/main.tsx`） |
| L4 | **通道常量不一致** | `file:showInFolder`、`file:downloadZip` 以字面量注册，未进入 `IPC_CHANNELS` |
| L5 | **项目 API 未接入 UI** | preload 暴露 `projects.list/get/delete` 且 IPC 已实现，但渲染层无项目列表/历史恢复界面（重启后只能重新开始，无法直接回到上次项目） |
| L6 | **硬编码默认值分散** | 模型 `gpt-4o`、温度 0.7、RAG maxResults 10 等散落多处 |
| L7 | **无 lockfile 验证** | 依赖均为 `^` 范围，需确认 lock 文件策略以保证可复现构建 |
| L8 | **CSP 宽松** | `script-src 'self' 'unsafe-eval' 'unsafe-inline'`（开发态 Vite 所需，生产应收紧） |
| L9 | **术语表硬编码** | zh-TW/zh-HK 术语对照表写死在 `LocalizerAgent`，无术语库管理界面 |

## 10.2 演进路线建议

### 阶段 1 — 清理与债务偿还（低风险）

1. 移除未使用依赖（3 个 `@langchain/*`）；决定 react-query 去留（采用或移除 Provider 包装）；
2. 删除模板残留 `src/main.ts`、`src/renderer.ts`；
3. 将字面量通道并入 `IPC_CHANNELS`；
4. 给 `AIStreamViewer` 补 `dita_ai_review` 标签；
5. 引入 lockfile + 最小 CI（typecheck/lint/build）。

### 阶段 2 — 质量与正确性（中风险）

1. **~~真 RAG~~（已完成 2026-08-22）**：`SemanticSearchService` 用 `provider.embed()` + SQLite `rag_chunks` 向量索引（余弦相似度排序）；`rag:addDocument` 落地为真实索引写入；无索引/embed 失败回退关键词搜索；
2. **~~上下文管理升级~~（已完成 2026-08-22）**：`summarizeLongText` 分块 map-reduce（先分块摘要再汇总）替代硬截断；
3. **~~多草稿支持~~（已完成 2026-08-22，后按需求改回单篇综合文档）**：`WriterAgent` 曾按分析文件产出多篇草稿；`humanEditedDrafts` 按草稿粒度保存人工编辑，`humanEdits` 仅套用 drafts[0]；ReviewPanel 提交完整 editedDrafts 数组，消除 `drafts[0]` 假设。**2026-08-22 再调整**：多文件上传用于汇总生成一份文档，`WriterAgent` 现合并全部 analysisResults 为 1 篇「综合技术文档」；
4. **~~接通 DOCX 出口~~（已完成 2026-08-22，PDF 待续）**：`buildDocx` 已接入 export 阶段（每篇同时导出 `.dita` + `.docx`）；PDF 需另选库；
5. **~~DITA 校验~~（已完成 2026-08-22）**：`validateDitaXml` 做 XML well-formedness 检查（声明/单根/标签配对/未转义字符），构建与导出阶段校验并输出警告；
6. **密钥安全**：`safeStorage` 加密 API Key；
7. **测试**：vitest 单测（`replaceFirst`、`extractJsonArray`、`dita.builder`、state-machine）+ Playwright e2e（mock AI 响应的全流程）。

### 阶段 3 — 架构演进（高风险）

1. **多 Provider**：实现 `AIProvider` 的 anthropic / ollama 版本（工厂已有分支占位）；
2. **~~真实暂停/取消~~（已完成 2026-08-22）**：`AIProvider` 已支持 `AbortSignal`（`CompletionOptions.signal`，OpenAI SDK 透传），goBack/pause 时取消在途请求；`workflow:pause` 落地为 `PAUSED:USER` + 检查点续跑；
3. **状态机正规化（已完成 2026-08-22）**：已引入 LangGraph 图编排（20 节点 + 9 个 `interrupt()` 暂停点 + SqliteSaver 检查点），`WorkflowEngine` 变为 facade；`pendingResume` Promise 模式与 `pipelineRunId` 陈旧防护已移除；go-back 改为检查点时间旅行；
4. **~~多窗口/多项目并发~~（部分完成 2026-08-22）**：Engine 已去单窗口耦合（事件广播改为 `BrowserWindow.getAllWindows()`）；项目列表 UI + 历史恢复仍未接入渲染层；
5. **生产 CSP 收紧**：移除 `unsafe-eval`/`unsafe-inline`（评估 Vite 生产构建产物）。

### 阶段 4 — 产品化

1. 术语库（glossary）管理界面，替换硬编码 zh-TW/zh-HK 术语表；
2. Prompt 版本化管理（各 Agent system prompt 外置为可编辑资源）；
3. 多主题 DITA 输出：`<map>` 聚合多篇 concept topic；
4. 评论数据沉淀：AI 审查意见导出为可训练/可复用数据集。

## 10.3 风险登记表（维护建议）

| ID | 风险 | 触发场景 | 缓解 |
|---|---|---|---|
| X1 | LLM 输出格式漂移 | Provider 升级/换模型后 JSON 格式变化 | 已有三层容错；建议增加输出 schema 校验 + 重试 |
| X2 | 长文本 token 超限 | 大文档直接全文送审（Reviewer/Localizer 无截断） | 分块审查；按模型上下文窗口动态截断 |
| X3 | 单文件失败中断用户体验 | 仅靠 error 状态标记，用户需人工判断 | 解析失败文件可在 review_upload 阶段移除后重跑 |
| X4 | 并发回退竞态 | 快速连续 goBack 多次 | 已缓解：`running` 集合 + `AbortController` 中止在途 invoke，重放前等待 settle；补充 e2e 覆盖 |
| X5 | SQLite 单文件并发 | 单窗口下无风险；多窗口扩展后需要 | 保持单写者 + WAL，或迁移连接池 |
