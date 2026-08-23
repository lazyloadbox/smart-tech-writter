import type {
  TranslationMapping,
  MappingImportRow,
  MappingImportResult,
  MappingStats,
  MappingImportParseResult,
} from '../../shared/types/mapping.types';

function getElectronApi() {
  if (!window.electronAPI) throw new Error('electronAPI is unavailable — running outside Electron?');
  return window.electronAPI;
}

export const mappingApi = {
  list: async (search?: string): Promise<TranslationMapping[]> => {
    const mappings = await getElectronApi().mapping.list({ search });
    console.info('[Mapping][API] list', { count: mappings.length, search });
    return mappings;
  },
  add: async (en: string, zhCN: string, zhTW: string): Promise<TranslationMapping | null> => {
    console.info('[Mapping][API] add', { en });
    return getElectronApi().mapping.add({ en, zhCN, zhTW });
  },
  update: async (id: string, en: string, zhCN: string, zhTW: string): Promise<TranslationMapping | null> => {
    console.info('[Mapping][API] update', { id });
    return getElectronApi().mapping.update({ id, en, zhCN, zhTW });
  },
  remove: async (id: string): Promise<void> => {
    console.info('[Mapping][API] delete', { id });
    await getElectronApi().mapping.delete({ id });
  },
  importParse: async (): Promise<MappingImportParseResult | null> => {
    const result = await getElectronApi().mapping.importParse();
    console.info('[Mapping][API] importParse', { fileName: result?.fileName, rowCount: result?.rows.length ?? 0 });
    return result;
  },
  import: async (rows: MappingImportRow[]): Promise<MappingImportResult> => {
    const result = await getElectronApi().mapping.import({ rows });
    console.info('[Mapping][API] import', { imported: result.imported, skipped: result.skipped });
    return result;
  },
  stats: async (): Promise<MappingStats> => {
    return getElectronApi().mapping.stats();
  },
};