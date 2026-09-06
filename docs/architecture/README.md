# Smart Tech Writer — 系统架构文档

> 基于源码 `d:\Projects\personal-project\smart-tech-writter` 的深度实现分析（分析日期：2026-08-23）。
> 本文档描述**当前代码的真实实现**，随实现演进持续更新。

## 一句话概括

**Smart Tech Writer 是一款基于 Electron 的桌面端 AI 技术文档生成器**：用户输入源文件（Word / PDF / 邮件 / 文本 / 代码），系统通过 20 阶段人机协作流水线（AI 解析 → AI 分析 → AI 撰写 → 多轮 AI/人工审查 → 本地化 → DITA 生成 → 导出），最终产出 **DITA 1.3 Concept Topic** 结构化技术文档（面向工业自动化领域）；并提供独立的 **DITA 本地化工具**（术语表驱动的多语言翻译）与 **总览工作台**（项目/运行记录恢复）。

## 文档地图

| 编号 | 文档 | 内容 |
|---|---|---|
| [01](01-overview.md) | 系统概述与设计目标 | 产品定位、核心能力、端到端用户旅程、关键设计决策 |
| [02](02-architecture.md) | 总体架构 | Electron 三进程模型、运行时结构、目录结构、构建与打包 |
| [03](03-workflow-engine.md) | 工作流引擎 | 20 阶段 LangGraph 图、暂停/恢复、回退、事件广播 |
| [04](04-ai-layer.md) | AI 层 | Provider 抽象、7 个 Agent、提示词管理、流式输出 |
| [05](05-file-processing.md) | 文件处理与文档构建 | 5 种文件读取器、语义 RAG、DITA/DOCX 构建器 |
| [06](06-storage-ipc.md) | 存储、IPC 与 Preload | SQLite 持久化、IPC 通道全集、contextBridge |
| [07](07-renderer.md) | 渲染进程（UI） | 4 Tab 组件树、Zustand 状态管理、各功能视图 |
| [08](08-data-models.md) | 数据模型与状态流转 | 共享类型系统、DocGenState 全字段、数据生命周期 |
| [09](09-dependencies.md) | 技术栈与依赖库详解 | 依赖库的版本、用途与使用位置 |
| [10](10-human-ai-artifact-editing.md) | 人机对话式产出物编辑 | 全部人工确认 step 的分析、格式与状态写回 |

## 全景架构速览

```mermaid
flowchart TB
    subgraph Renderer["渲染进程 (Renderer / Chromium)"]
        UI["React 19 UI<br/>4 Tab：总览 / Doc Generator / 本地化 / Settings"]
        ZS["Zustand 5<br/>workflow / localization / mapping / settings store"]
        API["workflow.api / localization.api / mapping.api"]
    end

    subgraph Preload["Preload (contextBridge)"]
        BRIDGE["window.electronAPI<br/>workflow / file / rag / settings / app / prompts / projects / localization / mapping"]
    end

    subgraph Main["主进程 (Main / Node.js)"]
        IPC["IPC 层 (6 个注册器, 50+ 通道)"]
        ENG["WorkflowEngine<br/>LangGraph facade + 检查点"]
        GRAPH["LangGraph StateGraph<br/>20 节点 + 9 interrupt 暂停点"]
        PL["pipeline.ts<br/>11 个阶段执行器"]
        AGENTS["7 个 Agent<br/>Parser/Analyzer/Writer/Reviewer/Localizer/DitaLocalizer/DitaReviewer"]
        PROV["AIProvider 抽象<br/>OpenAIProvider (openai SDK)"]
        READERS["File Readers ×5<br/>Word/PDF/Email/Text/Code"]
        RAG["SemanticSearchService<br/>语义向量检索 + 关键词回退"]
        DITA["document-builder<br/>dita.builder / docx.builder"]
        LOC["LocalizationService<br/>独立 DITA 翻译 + MappingService 术语表"]
        DB["better-sqlite3<br/>smart-tech-writer.db + langgraph.db"]
        FS["userData/projects/&lt;id&gt;"]
    end

    UI --> ZS --> API
    API --> BRIDGE
    BRIDGE -->|"ipcRenderer.invoke / on"| IPC
    IPC --> ENG
    ENG --> GRAPH
    GRAPH --> PL
    PL --> AGENTS --> PROV
    PL --> READERS
    PL --> RAG
    PL --> DITA
    IPC --> LOC
    LOC --> PROV
    ENG --> DB
    PL --> FS
    PROV -.->|"HTTPS (OpenAI 兼容 API)"| LLM["外部 LLM 服务<br/>(OpenAI / 302.ai / 任意兼容端点)"]
```

## 技术栈速览

| 层 | 技术 | 版本 |
|---|---|---|
| 桌面框架 | Electron + Electron Forge (Vite 插件) | 42.4.1 / 7.11.2 |
| 构建 | Vite | 5.4.21 |
| 前端 | React / TypeScript | 19.2 / 5.9 |
| 样式 | Tailwind CSS 4 | 4.3.1 |
| 状态 | Zustand | 5.0.14 |
| 工作流 | LangGraph（StateGraph + SqliteSaver 检查点） | 1.4.4 |
| AI | openai SDK（自研 Provider 抽象层） | 6.44.0 |
| 存储 | better-sqlite3 | 12.11.1 |
| 文档解析 | mammoth / pdf-parse / mailparser | — |
| 文档生成 | 自研 DITA builder / docx | 9.7.1 |
| 表格导入 | exceljs（翻译映射 Excel 导入） | 4.4.0 |
| 日志 | electron-log | 5.4.4 |

## 快速事实

- **工作流**：20 个阶段（LangGraph 节点），其中 9 个为人工暂停点（PAUSED:*）+ 1 个用户暂停（PAUSED:USER）
- **AI 调用**：8 个 AI 阶段全部支持流式输出（含 thinking 推理过程流式显示）
- **Agent**：7 个（FileParser / Analyzer / Writer / Reviewer×4 模式 / Localizer / DitaLocalizer / DitaReviewer）
- **输出**：每篇文档同时导出 `.dita` + `.docx`（DITA 内置 well-formedness 校验与自动修复）
- **RAG**：语义向量检索（`rag_chunks` 表余弦相似度），无索引/embed 失败时回退关键词搜索
- **持久化**：`projects.state_json` 整状态镜像 + `langgraph.db` 检查点（崩溃恢复）+ `localization_runs` 运行记录
- **独立功能**：DITA 本地化工具（7 阶段工作流 + 术语表驱动）+ 总览工作台（项目/记录恢复）
- **提示词**：全部 Agent 提示词集中管理（`prompts` 模块），设置页可覆盖
