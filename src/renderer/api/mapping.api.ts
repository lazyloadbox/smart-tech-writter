import type {
  TranslationMapping,
  GlossaryEntryKind,
  MappingImportParseResult,
  MappingImportPlanResult,
  MappingImportResult,
  MappingListResult,
  MappingStats,
  GlossaryBackupInfo,
  GlossaryBatchUndoResult,
  GlossaryImportBatchInfo,
  GlossaryRestoreResult,
} from '../../shared/types/mapping.types';
import type {
  MappingImportOptionsPayload,
  MappingImportPlanPayload,
} from '../../shared/types/ipc.types';

function getElectronApi() {
  if (!window.electronAPI) throw new Error('electronAPI is unavailable — running outside Electron?');
  return window.electronAPI;
}

export const mappingApi = {
  list: async (query: {
    search?: string;
    offset?: number;
    limit?: number;
    kind?: GlossaryEntryKind;
  }): Promise<MappingListResult> => {
    const result = await getElectronApi().mapping.list(query);
    console.info('[Mapping][API] list', { count: result.items.length, total: result.total, ...query });
    return result;
  },
  add: async (
    en: string,
    zhCN: string,
    zhTW: string,
    kind?: GlossaryEntryKind,
    doNotUse?: string[]
  ): Promise<TranslationMapping | null> => {
    console.info('[Mapping][API] add', { en });
    return getElectronApi().mapping.add({ en, zhCN, zhTW, kind, doNotUse });
  },
  update: async (
    id: string,
    en: string,
    zhCN: string,
    zhTW: string,
    kind?: GlossaryEntryKind,
    doNotUse?: string[]
  ): Promise<TranslationMapping | null> => {
    console.info('[Mapping][API] update', { id });
    return getElectronApi().mapping.update({ id, en, zhCN, zhTW, kind, doNotUse });
  },
  remove: async (id: string): Promise<void> => {
    console.info('[Mapping][API] delete', { id });
    await getElectronApi().mapping.delete({ id });
  },
  importParse: async (): Promise<MappingImportParseResult | null> => {
    const result = await getElectronApi().mapping.importParse();
    console.info('[Mapping][API] importParse', {
      fileName: result?.fileName,
      rows: result?.preview.length ?? 0,
    });
    return result;
  },
  importPlan: async (payload: MappingImportPlanPayload): Promise<MappingImportPlanResult> => {
    const result = await getElectronApi().mapping.importPlan(payload);
    console.info('[Mapping][API] importPlan', {
      parseId: payload.parseId,
      mode: payload.mode,
      insert: result.plan.toInsert,
      update: result.plan.toUpdate,
      delete: result.plan.toDelete,
    });
    return result;
  },
  import: async (payload: MappingImportOptionsPayload): Promise<MappingImportResult> => {
    const result = await getElectronApi().mapping.import(payload);
    console.info('[Mapping][API] import', {
      inserted: result.toInsert,
      updated: result.toUpdate,
      deleted: result.toDelete,
      skipped: result.skipped,
    });
    return result;
  },
  export: async (): Promise<string | null> => {
    const filePath = await getElectronApi().mapping.export();
    console.info('[Mapping][API] export', { filePath });
    return filePath;
  },
  stats: async (): Promise<MappingStats> => {
    return getElectronApi().mapping.stats();
  },
  /** P4-1: list backup files. */
  backups: async (): Promise<GlossaryBackupInfo[]> => {
    const result = await getElectronApi().mapping.backups();
    return result.items;
  },
  /** P4-1: restore one backup (the current table is backed up first). */
  restore: async (fileName: string): Promise<GlossaryRestoreResult> => {
    const result = await getElectronApi().mapping.restore({ fileName });
    console.info('[Mapping][API] restore', { fileName, restored: result.restored });
    return result;
  },
  /** P4-2: list applied import batches. */
  batches: async (): Promise<GlossaryImportBatchInfo[]> => {
    const result = await getElectronApi().mapping.batches();
    return result.items;
  },
  /** P4-2: undo one import batch. */
  batchUndo: async (batchId: string): Promise<GlossaryBatchUndoResult> => {
    const result = await getElectronApi().mapping.batchUndo({ batchId });
    console.info('[Mapping][API] batchUndo', result);
    return result;
  },
};
