import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import { getSetting } from '../modules/storage/database';
import type { LocalSearchService } from '../modules/rag/local-search.service';

export function registerRagHandlers(ragService: LocalSearchService): void {
  ipcMain.handle(IPC_CHANNELS.RAG_QUERY, async (_event, { query }) => {
    const dir = getSetting('rag.searchDirectory') ?? '';
    return ragService.search(query, { directory: dir });
  });

  ipcMain.handle(IPC_CHANNELS.RAG_ADD_DOCUMENT, async (_event, { filePath }) => {
    // In MVP1 the LocalSearchService is purely filesystem-based; no indexing needed
    void filePath;
    return { success: true };
  });
}
