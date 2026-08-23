import { app, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type { AppPaths } from '../../shared/types/ipc.types';
import { getSetting, setSetting, getDatabase } from '../modules/storage/database';
import { createProvider } from '../modules/ai-providers/index';
import {
  getPromptCatalogWithOverrides,
  savePromptOverrides,
  resetPromptOverrides,
} from '../modules/prompts';
import type { PromptOverrides } from '../modules/prompts';
import type { WorkflowEngine } from '../modules/workflow/index';
import type { LocalizationService } from '../modules/localization/localization.service';
import log from 'electron-log';

export function registerSettingsHandlers(engine: WorkflowEngine, localizationService: LocalizationService): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, { key }) => {
    return getSetting(key);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, { key, value }) => {
    setSetting(key, value);
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, async () => {
    return app.getVersion();
  });

  // 应用目录信息（设置页展示：执行目录 / 设置目录 / 数据库 / 项目 / 日志）
  ipcMain.handle(IPC_CHANNELS.APP_GET_PATHS, async (): Promise<AppPaths> => {
    const userData = app.getPath('userData');
    return {
      appPath: app.getAppPath(),
      userData,
      databasePath: path.join(userData, 'smart-tech-writer.db'),
      langgraphDbPath: path.join(userData, 'langgraph.db'),
      projectsDir: path.join(userData, 'projects'),
      logsDir: app.getPath('logs'),
    };
  });

  // 打开目录（目录用系统资源管理器打开；文件则在资源管理器中定位）
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_PATH, async (_event, { targetPath }: { targetPath: string }) => {
    if (!targetPath) return;
    if (!fs.existsSync(targetPath)) {
      log.warn('[App][IPC] app:openPath - path not found', { targetPath });
      return;
    }
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      await shell.openPath(targetPath);
    } else {
      shell.showItemInFolder(targetPath);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROMPTS_GET, async () => {
    return getPromptCatalogWithOverrides();
  });

  ipcMain.handle(IPC_CHANNELS.PROMPTS_SET, async (_event, payload: { overrides: PromptOverrides }) => {
    savePromptOverrides(payload.overrides ?? {});
  });

  ipcMain.handle(IPC_CHANNELS.PROMPTS_RESET, async () => {
    resetPromptOverrides();
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, async () => {
    const db = getDatabase();
    const rows = db.prepare('SELECT id, name, status, current_stage, created_at, updated_at FROM projects ORDER BY updated_at DESC').all() as {
      id: string; name: string; status: string; current_stage: string; created_at: string; updated_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      currentStage: r.current_stage,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_GET, async (_event, { projectId }) => {
    const db = getDatabase();
    const row = db.prepare('SELECT id, name, status, current_stage, created_at, updated_at FROM projects WHERE id = ?').get(projectId) as
      | { id: string; name: string; status: string; current_stage: string; created_at: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return { id: row.id, name: row.name, status: row.status, currentStage: row.current_stage, createdAt: row.created_at, updatedAt: row.updated_at };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_GET_STATE, async (_event, { projectId }) => {
    const db = getDatabase();
    const row = db.prepare('SELECT state_json FROM projects WHERE id = ?').get(projectId) as
      | { state_json: string | null }
      | undefined;
    if (!row?.state_json) return null;
    try {
      return JSON.parse(row.state_json);
    } catch (err) {
      log.error('[Projects] getState: failed to parse state_json', { projectId, error: String(err) });
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_DELETE, async (_event, { projectId }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    // Also remove the LangGraph checkpoint thread for this project.
    await engine.deleteProject(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_RELOAD_PROVIDER, async () => {
    const apiKey = getSetting('openai.apiKey') ?? '';
    const baseURL = getSetting('openai.baseURL') ?? undefined;
    const model = getSetting('openai.model') ?? 'gpt-4o';
    const provider = createProvider({
      type: 'openai',
      apiKey,
      baseURL: baseURL || undefined,
      defaultModel: model,
    });
    engine.updateProvider(provider);
    localizationService.updateProvider(provider);
  });
}
