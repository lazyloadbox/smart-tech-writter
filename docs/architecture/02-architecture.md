# 02 — 总体架构

## 2.1 Electron 三进程模型

```mermaid
flowchart LR
    subgraph P1["① 主进程 (Main / Node.js)"]
        direction TB
        M1["app 生命周期<br/>src/main/index.ts"]
        M2["服务初始化<br/>DB → Provider → RAG → Engine → Localization → IPC"]
        M3["WorkflowEngine + LangGraph + Pipeline + Agents"]
        M4["better-sqlite3 / fs 文件系统"]
    end
    subgraph P2["② Preload (沙箱桥)"]
        P2A["src/preload.ts → ./preload/index<br/>contextBridge.exposeInMainWorld('electronAPI')"]
    end
    subgraph P3["③ 渲染进程 (Renderer / Chromium)"]
        direction TB
        R1["React 19 + Tailwind 4<br/>4 Tab：总览 / Doc Generator / 本地化 / Settings"]
        R2["Zustand stores"]
        R3["workflow.api / localization.api / mapping.api<br/>(仅经 window.electronAPI)"]
    end
    LLM["外部 LLM API<br/>(OpenAI 兼容)"]

    P3 -->|"ipcRenderer.invoke / .on<br/>(50+ 通道)"| P2
    P2 -->|"ipcMain.handle / webContents.send"| P1
    P1 -->|"HTTPS chat.completions<br/>(complete / stream / embed)"| LLM
```

安全约束（`src/main/index.ts` 与 `forge.config.ts`）：

| 配置 | 值 | 意义 |
|---|---|---|
| `contextIsolation` | `true` | 渲染进程 JS 与 preload/主进程世界隔离 |
| `nodeIntegration` | `false` | 渲染进程无 Node 能力，只能走桥 |
| Fuses `RunAsNode` | `false` | 打包后禁止以 Node 模式运行 |
| Fuses `EnableEmbeddedAsarIntegrityValidation` | `true` | 校验内嵌 asar 完整性 |
| Fuses `OnlyLoadAppFromAsar` | `true` | 仅从 asar 加载应用代码 |
| Fuses `EnableCookieEncryption` | `true` | Cookie 加密 |
| `PathGuard` | 白名单 | `file:read` 仅允许用户选中文件 + `userData/projects` + RAG 目录，扩展名限文本/代码 |

## 2.2 主进程初始化时序

```mermaid
sequenceDiagram
    participant App as Electron app
    participant Main as src/main/index.ts
    participant DB as storage/database
    participant Prov as ai-providers
    participant Rag as SemanticSearchService
    participant Eng as WorkflowEngine
    participant Loc as LocalizationService
    participant IPC as ipc/index

    App->>Main: ready
    Main->>Main: createWindow() (1400×900, contextIsolation)
    Main->>DB: getDatabase() → 建库 + 迁移 (settings/projects/rag_chunks/localization_runs/translation_mappings)
    Main->>Prov: createProvider({type:'openai', apiKey, baseURL, model})
    Note over Main: 配置从 settings 表读取<br/>openai.apiKey / baseURL / model
    Main->>Rag: new SemanticSearchService(provider, rag.searchDirectory)
    Main->>Eng: new WorkflowEngine(provider, rag)  // 窗口无关，事件广播到所有窗口
    Main->>Loc: new MappingService() + new LocalizationService(provider, mapping)
    Main->>IPC: registerAllIpcHandlers(engine, rag, localization, mapping)
    Note over IPC: 注册 6 组 handler<br/>(workflow/file/rag/settings/localization/mapping)
```

## 2.3 模块依赖关系（主进程内部）

```mermaid
flowchart TD
    subgraph ipc["src/main/ipc"]
        W_IPC["workflow.ipc.ts"]
        F_IPC["file.ipc.ts"]
        R_IPC["rag.ipc.ts"]
        S_IPC["settings.ipc.ts"]
        L_IPC["localization.ipc.ts"]
        M_IPC["mapping.ipc.ts"]
    end
    subgraph workflow["src/main/modules/workflow"]
        ENG["index.ts (WorkflowEngine facade)"]
        GRAPH["langgraph/ (graph + graph-state + emitter + checkpointer)"]
        PIPE["pipeline.ts (11 阶段执行器)"]
        SM["state-machine.ts"]
    end
    subgraph agents["modules/agents"]
        BASE["base.agent.ts"]
        FP["file-parser.agent"]
        AN["analyzer.agent"]
        WR["writer.agent"]
        RV["reviewer.agent"]
        LO["localizer.agent"]
        DL["dita-localizer.agent"]
        DR["dita-reviewer.agent"]
    end
    subgraph infra["modules/*"]
        PROV["ai-providers/"]
        READ["file-readers/"]
        RAGM["rag/ (semantic-search + local-search)"]
        BUIL["document-builder/"]
        STO["storage/ (database + file-storage)"]
        PROMPTS["prompts/ (提示词注册表 + 覆盖)"]
        SEC["security/ (path-guard)"]
        CTX["context/ (map-reduce)"]
        LOC["localization/ (localization.service + mapping.service)"]
    end

    W_IPC --> ENG
    F_IPC --> ENG
    F_IPC --> STO
    S_IPC --> STO
    S_IPC --> PROV
    S_IPC --> PROMPTS
    R_IPC --> RAGM
    L_IPC --> LOC
    M_IPC --> LOC
    ENG --> GRAPH
    GRAPH --> PIPE
    PIPE --> FP & AN & WR & RV & LO
    FP & AN & WR & RV & LO --> BASE
    BASE --> PROV
    PIPE --> READ & RAGM & BUIL & STO & PROMPTS & CTX
    ENG --> SM
    ENG --> STO
    LOC --> DL & DR
    DL & DR --> BASE
    LOC --> BUIL
    LOC --> PROMPTS
    LOC --> STO
```

依赖方向说明：`ipc → workflow → langgraph → pipeline → agents → ai-providers`；`pipeline → file-readers / rag / document-builder / storage / prompts / context`；`localization → agents / document-builder / prompts / storage`；`file:read → security/path-guard`。不存在反向依赖。共享类型统一来自 `src/shared/types/`。

## 2.4 目录结构（含职责标注）

```
smart-tech-writter/
├── forge.config.ts            # Electron Forge：VitePlugin + makers + Fuses + 打包 ignore（保留 node_modules）
├── vite.main.config.ts        # 主进程构建；external: ['better-sqlite3','electron']
├── vite.preload.config.ts     # preload 构建（空配置）
├── vite.renderer.config.ts    # react 插件 + postcss
├── tailwind.config.js         # Tailwind 4（content 指向 renderer）
├── postcss.config.js          # @tailwindcss/postcss + autoprefixer
├── index.html                 # 渲染入口 HTML（含 CSP）
├── forge.env.d.ts             # MAIN_WINDOW_VITE_* 全局类型
├── .github/workflows/         # CI：build.yml（手动构建）+ release.yml（一键发布）
├── scripts/
│   └── bump-version.mjs       # 版本自动升级脚本（patch/minor/major/指定版本）
├── docs/architecture/         # 本文档集
├── test/mock-case-01/         # 样例输入（esp32-pwm .eml/.txt/.dita/.docx）
├── local.md                   # 本地 AI API 配置备忘（不入库）
└── src/
    ├── main.ts                # ⚠ Forge 模板残留（未被构建引用）
    ├── renderer.ts            # ⚠ Forge 模板残留（未被引用）
    ├── preload.ts             # ✅ preload 构建入口（转 re-export ./preload/index）
    ├── main/
    │   ├── index.ts           # 主进程入口：窗口 + 服务初始化
    │   ├── ipc/
    │   │   ├── index.ts       # 统一注册器（6 组）
    │   │   ├── workflow.ipc.ts# 工作流 13 通道
    │   │   ├── file.ipc.ts    # 文件对话框/导出 6 通道
    │   │   ├── rag.ipc.ts     # RAG 5 通道
    │   │   ├── settings.ipc.ts# 设置+提示词+项目 12 通道
    │   │   ├── localization.ipc.ts # 独立本地化 12 通道
    │   │   └── mapping.ipc.ts # 翻译映射 7 通道
    │   └── modules/
    │       ├── agents/        # 7 个 Agent + 基类
    │       ├── ai-providers/  # Provider 抽象 + OpenAI 实现 + 工厂
    │       ├── context/       # map-reduce 长文本摘要
    │       ├── document-builder/ # dita.builder(校验+修复) + docx.builder
    │       ├── file-readers/  # 5 种读取器 + 工厂
    │       ├── localization/  # LocalizationService + MappingService + 默认术语表
    │       ├── prompts/       # 提示词注册表 + 覆盖管理
    │       ├── rag/           # SemanticSearchService + LocalSearchService 回退
    │       ├── security/      # PathGuard 路径白名单
    │       ├── storage/       # SQLite + 项目文件存储
    │       └── workflow/      # Engine facade + LangGraph + Pipeline + StateMachine
    ├── preload/
    │   ├── index.ts           # contextBridge 暴露 electronAPI
    │   └── api.types.ts       # ElectronAPI 类型 + window 全局声明
    ├── renderer/
    │   ├── main.tsx           # React 根
    │   ├── App.tsx            # 4 Tab 切换（总览/Doc Generator/本地化/Settings）
    │   ├── navigation.ts      # Tab 元数据（单一来源）
    │   ├── api/               # workflow / localization / mapping API 封装
    │   ├── stores/            # workflow / localization / mapping / settings store (zustand)
    │   ├── components/        # AppLayout + StepNavigation（公共步骤导航）
    │   └── features/
    │       ├── overview/      # 总览页（功能入口 + 最近项目 + 本地化记录）
    │       ├── doc-generator/ # 主功能：20 阶段 UI + 组件 + useWorkflow
    │       ├── localization/  # 独立 DITA 本地化
    │       └── settings/      # AI 配置 + 提示词 + 翻译映射
    └── shared/types/          # document / workflow / ipc / localization / mapping / prompts
```

## 2.5 构建与打包

```mermaid
flowchart LR
    SRC["src/"] --> VITE["@electron-forge/plugin-vite"]
    VITE -->|"build[0] entry: src/main/index.ts"| MAIN_JS[".vite/build/index.js"]
    VITE -->|"build[1] entry: src/preload.ts"| PRE_JS[".vite/build/preload.js"]
    VITE -->|"renderer[0] name: main_window"| REN["renderer/main_window/"]
    MAIN_JS --> PKG["electron-forge package (asar:true)<br/>ignore 保留 node_modules + AutoUnpackNatives"]
    PRE_JS --> PKG
    REN --> PKG
    PKG --> MAKERS["makers: Squirrel(win) / ZIP(mac) / DEB / RPM"]
    PKG --> PORTABLE["electron-builder --win portable<br/>dist/Smart Tech Writer x.y.z.exe"]
```

要点：

- 运行时窗口加载路径：开发 `MAIN_WINDOW_VITE_DEV_SERVER_URL`，生产 `../renderer/main_window/index.html`；
- `better-sqlite3` 与 `electron` 在主进程 Vite 构建中 external；`forge.config.ts` 覆盖 `ignore` 保留 `node_modules`（否则运行时 `require('better-sqlite3')` 报 Cannot find module），由 `@electron-forge/plugin-auto-unpack-natives` 解包原生模块；
- 单文件便携版用 electron-builder（`npm run dist:portable`），自解压运行无需安装；
- CI：`.github/workflows/build.yml`（手动构建安装包 + portable exe）、`release.yml`（一键发布：`bump-version.mjs` 升级版本 → 构建 → 打 tag → GitHub Release）。

## 2.6 运行时数据流全景（读 → 写）

```mermaid
flowchart LR
    subgraph IN["输入"]
        A["源文件<br/>docx/pdf/eml/txt/md/code"]
    end
    subgraph AI["AI 流水线"]
        B["FileParserAgent<br/>摘要"]
        C["AnalyzerAgent<br/>分析结果"]
        D["WriterAgent<br/>Markdown 草稿"]
        E["ReviewerAgent ×4 模式<br/>评论数组"]
        F["LocalizerAgent<br/>本地化草稿"]
    end
    subgraph HUMAN["人工检查点"]
        H["ReviewPanel<br/>接受/编辑"]
    end
    subgraph OUT["输出"]
        G["dita.builder<br/>DITA 1.3 XML"]
        I["runExportStage<br/>*.dita + *.docx"]
    end
    subgraph PERS["持久化"]
        J["projects.state_json"]
        K["userData/projects/&lt;id&gt;/"]
        L["langgraph.db 检查点"]
    end
    subgraph LOC["独立本地化"]
        M["DitaLocalizerAgent<br/>翻译 .dita"]
        N["DitaReviewerAgent<br/>本地化评审"]
        O["exportTo<br/>&lt;basename&gt;.&lt;lang&gt;.dita"]
    end

    A -->|"readers 抽取文本"| B
    B --> C
    C -->|"RAG 参考上下文"| D
    D --> H --> E --> H
    D --> F
    F --> G --> H --> I
    B & C & D & E & F --> J
    I --> K
    B & C & D & E & F --> L
    M --> N --> O
    M -->|"术语表注入"| P["MappingService<br/>translation_mappings"]
```
