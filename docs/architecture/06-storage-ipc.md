# 06 — 存储、IPC 与 Preload

## 6.1 SQLite 存储（`src/main/modules/storage/database.ts`）

- 引擎：`better-sqlite3`（同步 API），文件位置 `app.getPath('userData')/smart-tech-writer.db`；
- PRAGMA：`journal_mode = WAL`、`foreign_keys = ON`；
- 迁移（`runMigrations`，幂等 `CREATE TABLE IF NOT EXISTS`）：

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'IDLE',
  current_stage TEXT NOT NULL DEFAULT 'upload_parse',
  state_json    TEXT,          -- DocGenState 全量 JSON 快照
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

关键行为：

| 行为 | 实现 |
|---|---|
| 写状态 | `persistState`：`INSERT OR REPLACE INTO projects(...)` 整状态序列化；每次阶段进入/完成/暂停/失败都会写 |
| 读状态 | `loadState`：`SELECT state_json` → `JSON.parse`，并对旧快照回填 `skipLocalization=false` |
| 设置 | `getSetting/setSetting`，键约定 `openai.apiKey` `openai.baseURL` `openai.model` `rag.searchDirectory` |
| 项目列表 | `projects:list` 按 `updated_at DESC` 返回 `Project[]`（不含 state_json） |
| 单例 | 模块级 `let db` 单例；`closeDatabase` 于 `window-all-closed` 调用 |

> ⚠ API Key 以**明文**存于 settings 表（见 10 篇安全建议）。

## 6.2 项目文件存储（`storage/file-storage.ts`）

| 函数 | 行为 |
|---|---|
| `getProjectsDir()` | `userData/projects`（递归创建） |
| `getProjectDir(id)` | `userData/projects/<id>` |
| `writeProjectFile(id, name, content)` | UTF-8 文本写入，返回绝对路径 |
| `readProjectFile(id, name)` | 读取文本，不存在返回 null |
| `writeProjectBinaryFile(id, name, buffer)` | 二进制写入（DITA 导出用），返回绝对路径 |

## 6.3 IPC 协议全集（27 个通道）

通道常量定义于 `src/shared/types/ipc.types.ts`（`IPC_CHANNELS`，25 个），另有 2 个通道在 `file.ipc.ts` 中以字符串字面量注册。方向：`invoke` = 渲染→主请求/响应，`send` = 主→渲染事件推送。

### 工作流组（13，`workflow.ipc.ts`）

| 通道 | 方向 | Payload → 返回 | 说明 |
|---|---|---|---|
| `workflow:start` | invoke | `{projectId, filePaths}` → `DocGenState` | 创建并异步启动流水线 |
| `workflow:status` | invoke | `{projectId}` → `DocGenState\|null` | 内存态优先，回退 DB |
| `workflow:pause` | invoke | `{projectId}` | **no-op**（占位） |
| `workflow:resume` | invoke | `{projectId}` | resumeFromHumanInput(空数据) |
| `workflow:goBack` | invoke | `{projectId, targetStage}` | 回退重跑 |
| `workflow:progress` | send | `WorkflowProgressEvent` | 阶段/状态/消息 + 日志条目 |
| `workflow:stream` | send | `WorkflowStreamEvent` | AI 流式 chunk |
| `workflow:humanReviewSubmit` | invoke | `{projectId, editedDrafts, acceptedCommentIds}` | 存 humanEditedDrafts + humanEdits + 标记 accepted |
| `workflow:humanConfirmSubmit` | invoke | `{projectId, approved, targetLanguage?, skipLocalization?, editedDrafts?, acceptedCommentIds?}` | 确认 + 语言 + 跳本地化 |
| `workflow:humanLocalizeSubmit` | invoke | `{projectId, editedLocalizedDrafts, acceptedCommentIds}` | 本地化人工提交 |
| `workflow:humanDitaSubmit` | invoke | `{projectId, editedDitaDocuments, acceptedCommentIds}` | DITA 人工提交 |
| `workflow:reviewContinue` | invoke | `{projectId, stage, editedDrafts?}` | 通用审核继续（可带改后草稿） |
| `workflow:aiEditDraft` | invoke | `{projectId, currentContent, instruction}` → `string` | AI 指令改稿（流式经 stream 通道） |

### 文件组（6，`file.ipc.ts`）

| 通道 | 方向 | 说明 |
|---|---|---|
| `file:select` | invoke | `dialog.showOpenDialog` 多选，扩展名过滤器含全部支持格式 |
| `file:read` | invoke | `PathGuard` 白名单校验（用户选中文件 + `userData/projects` + RAG 目录，扩展名限文本/代码）后 UTF-8 读取（预览用） |
| `file:showInFolder` | invoke | `shell.showItemInFolder`（**字面量注册**） |
| `file:downloadZip` | invoke | 保存对话框 + archiver 打 ZIP（**字面量注册**） |
| `file:saveDita` | invoke | 另存单个 DITA 文件 |
| `file:exportAll` | invoke | 选目录批量复制输出文件 |

### RAG 组（2，`rag.ipc.ts`）

| 通道 | 说明 |
|---|---|
| `rag:query` | 实时读取 `rag.searchDirectory` 设置并搜索（语义索引优先，回退关键词） |
| `rag:addDocument` | 真实索引：读取 → 分块 → embed → 写入 `rag_chunks` 表 |
| `rag:removeDocument` | 删除某文件的索引 chunk |
| `rag:clearIndex` | 清空整个索引 |
| `rag:indexStats` | 返回已索引 chunk 数 |

### 设置/项目组（6，`settings.ipc.ts`）

| 通道 | 说明 |
|---|---|
| `settings:get` / `settings:set` | 键值读写 |
| `settings:reloadProvider` | 重建 OpenAIProvider 并 `engine.updateProvider` |
| `projects:list` / `projects:get` / `projects:delete` | 项目元数据 CRUD |

## 6.4 Preload 桥（`src/preload/`）

```mermaid
flowchart LR
    subgraph Preload
        E["src/preload.ts<br/>(构建入口)"]
        I["src/preload/index.ts"]
        T["api.types.ts"]
    end
    E -->|"import './preload/index'"| I
    I -->|"contextBridge.exposeInMainWorld('electronAPI', ...)"| W["window.electronAPI"]
    T -->|"declare global Window + ElectronAPI"| W
```

暴露面：`workflow`（13 方法/事件）· `file`（6）· `rag`（2）· `settings`（3）· `projects`（3）。事件订阅返回**取消订阅函数**（`ipcRenderer.removeListener`），供 React effect 清理。

安全约定：渲染进程**只允许**通过 `window.electronAPI` 通信；`api.types.ts` 同时声明 `Window` 全局类型供 TypeScript 校验。
