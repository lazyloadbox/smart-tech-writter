# 09 — 技术栈与依赖库详解

> 来源：`package.json` + 源码 import 扫描（2026-08-23）

## 9.1 运行时依赖（dependencies）

| 库 | 版本 | 用途 | 使用位置 | 状态 |
|---|---|---|---|---|
| `openai` | ^6.44.0 | OpenAI 兼容 API 客户端 | `ai-providers/openai.provider.ts` | ✅ 在用 |
| `better-sqlite3` | ^12.11.1 | 同步 SQLite（WAL 模式） | `storage/database.ts` | ✅ 在用 |
| `@langchain/langgraph` | ^1.4.4 | 图工作流编排（StateGraph + interrupt + Command） | `workflow/langgraph/graph.ts` | ✅ 在用 |
| `@langchain/langgraph-checkpoint-sqlite` | ^1.0.4 | SqliteSaver 检查点持久化 | `workflow/langgraph/checkpointer.ts` | ✅ 在用 |
| `@langchain/core` | ^1.2.0 | LangGraph 依赖（RunnableConfig 等类型） | `workflow/langgraph/*` | ✅ 在用（间接） |
| `electron-log` | ^5.4.4 | 主进程文件日志 | main/index、engine、全部 ipc | ✅ 在用 |
| `electron-squirrel-startup` | ^1.0.1 | Windows 安装/卸载快捷方式处理 | `main/index.ts` 启动检查 | ✅ 在用 |
| `mammoth` | ^1.12.0 | .docx → 纯文本 | `file-readers/word.reader.ts` | ✅ 在用 |
| `pdf-parse` | ^2.4.5 | PDF 文本抽取（v1/v2 双适配） | `file-readers/pdf.reader.ts` | ✅ 在用 |
| `mailparser` | ^3.9.11 | .eml 邮件解析 | `file-readers/email.reader.ts` | ✅ 在用 |
| `react` / `react-dom` | ^19.2.7 | UI 框架 | 全部 renderer | ✅ 在用 |
| `react-markdown` | ^10.1.0 | Markdown 渲染 | `components/MarkdownRenderer.tsx` | ✅ 在用 |
| `remark-gfm` | ^4.0.1 | GFM（表格/任务列表） | `MarkdownRenderer.tsx` | ✅ 在用 |
| `zustand` | ^5.0.14 | 全局状态管理 | `stores/*.store.ts`（workflow/localization/mapping/settings） | ✅ 在用 |
| `uuid` | ^14.0.0 | 唯一 ID（v4） | engine、pipeline、agents、services、workflow.api | ✅ 在用 |
| `archiver` | ^8.0.0 | ZIP 打包下载 | `ipc/file.ipc.ts` downloadZip | ✅ 在用（需 `require()` 导入） |
| `docx` | ^9.7.1 | DOCX 文档构建 | `document-builder/docx.builder.ts`（已接入 export） | ✅ 在用 |
| `exceljs` | ^4.4.0 | Excel 解析（翻译映射导入） | `ipc/mapping.ipc.ts` importParse | ✅ 在用 |

## 9.2 开发依赖（devDependencies）

| 库 | 版本 | 用途 |
|---|---|---|
| `electron` | 42.4.1 | 桌面运行时 |
| `@electron-forge/cli` | ^7.11.2 | 脚手架/打包 CLI |
| `@electron-forge/maker-squirrel` | ^7.11.2 | Windows 安装包 |
| `@electron-forge/maker-zip` | ^7.11.2 | mac ZIP |
| `@electron-forge/maker-deb` / `maker-rpm` | ^7.11.2 | Linux 包 |
| `@electron-forge/plugin-vite` | ^7.11.2 | Vite 构建集成（三入口） |
| `@electron-forge/plugin-auto-unpack-natives` | ^7.11.2 | 原生模块（better-sqlite3）解包 |
| `@electron-forge/plugin-fuses` + `@electron/fuses` | ^7.11.2 / ^1.8.0 | Electron 安全熔丝 |
| `electron-builder` | ^26.15.3 | 单文件 portable exe |
| `@vitejs/plugin-react` | ^4.7.0 | React JSX 编译 |
| `vite` | ^5.4.21 | 构建器 |
| `typescript` | ^5.9.3 | 语言 |
| `tailwindcss` + `@tailwindcss/postcss` | ^4.3.1 | 原子化 CSS |
| `postcss` + `autoprefixer` | ^8.5.15 / ^10.5.0 | CSS 后处理 |
| `eslint` + `@typescript-eslint/*` + `eslint-plugin-import` | 8.57.1 / 5.62.0 / 2.32.0 | Lint |
| `@types/*`（archiver、better-sqlite3、mailparser、pdf-parse、react、react-dom、uuid、electron-squirrel-startup） | — | 类型声明 |

## 9.3 原生模块与打包注意

- `better-sqlite3` 是**原生 N-API 模块**：主进程 Vite 构建 external；`forge.config.ts` 覆盖 `ignore` 保留 `node_modules`（否则运行时 `require('better-sqlite3')` 报 Cannot find module），`AutoUnpackNativesPlugin` 负责解包 `.node` 文件到 asar 之外；Electron 大版本升级（如 42.x）时需要 rebuild；
- `archiver` 无 CJS 默认导出，代码使用 `require('archiver')` 绕过 ESM 互操作问题；
- `pdf-parse` v2 的破坏性 API 变更由自研适配层吸收（见 05 篇）；
- 单文件 portable exe 用 electron-builder（`package.json` `build` 配置：files=[".vite/**","package.json"]、asarUnpack=["**/*.node"]、win.target=["portable"]）。

## 9.4 版本管理

- `package.json` 全部依赖使用 `^` 范围（允许 minor 升级）；已存在 `package-lock.json`（`npm ci` 可复现构建）；
- 无正式测试框架依赖（jest/vitest 均未安装）；`test/langgraph/` 集成测试已移除（2026-08-23）。

## 9.5 scripts

| 命令 | 行为 |
|---|---|
| `npm start` | `electron-forge start`（Vite 开发服务器 + 热更新） |
| `npm run package` | 打包应用目录 |
| `npm run make` | 生成安装包（Squirrel/ZIP/DEB/RPM） |
| `npm run dist:portable` | electron-builder 生成单文件 portable exe |
| `npm run publish` | 发布 |
| `npm run version:bump` | 本地升级版本号（`patch`/`minor`/`major`/指定版本，同步 package-lock） |
| `npm run lint` | `eslint --ext .ts,.tsx .` |
