import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import { getSetting, setSetting, getDatabase } from '../modules/storage/database';
import { createProvider } from '../modules/ai-providers/index';
import type { WorkflowEngine } from '../modules/workflow/index';

export function registerSettingsHandlers(engine: WorkflowEngine): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, { key }) => {
    return getSetting(key);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, { key, value }) => {
    setSetting(key, value);
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
  });
}
