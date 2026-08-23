import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import { getSetting } from '../modules/storage/database';
import type { RagService } from '../modules/rag/semantic-search.service';

export function registerRagHandlers(ragService: RagService): void {
  ipcMain.handle(IPC_CHANNELS.RAG_QUERY, async (_event, { query }) => {
    const dir = getSetting('rag.searchDirectory') ?? '';
    return ragService.search(query, { directory: dir });
  });

  // Real indexing: reads + chunks + embeds the document into the rag_chunks table.
  ipcMain.handle(IPC_CHANNELS.RAG_ADD_DOCUMENT, async (_event, { filePath }) => {
    return ragService.addDocument(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.RAG_REMOVE_DOCUMENT, async (_event, { filePath }) => {
    await ragService.removeDocument(filePath);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.RAG_CLEAR_INDEX, async () => {
    await ragService.clearIndex();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.RAG_INDEX_STATS, async () => {
    return { indexedChunks: ragService.indexedCount() };
  });
}
