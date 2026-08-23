import { create } from 'zustand';
import type {
  TranslationMapping,
  MappingImportRow,
  MappingImportResult,
  MappingStats,
  MappingImportParseResult,
} from '../../shared/types/mapping.types';
import { mappingApi } from '../api/mapping.api';

interface MappingStore {
  mappings: TranslationMapping[];
  stats: MappingStats | null;
  loaded: boolean;
  search: string;
  load: () => Promise<void>;
  add: (en: string, zhCN: string, zhTW: string) => Promise<TranslationMapping | null>;
  update: (id: string, en: string, zhCN: string, zhTW: string) => Promise<TranslationMapping | null>;
  remove: (id: string) => Promise<void>;
  importParse: () => Promise<MappingImportParseResult | null>;
  importRows: (rows: MappingImportRow[]) => Promise<MappingImportResult>;
  setSearch: (v: string) => void;
}

export const useMappingStore = create<MappingStore>((set, get) => ({
  mappings: [],
  stats: null,
  loaded: false,
  search: '',

  load: async () => {
    const { search } = get();
    const [mappings, stats] = await Promise.all([
      mappingApi.list(search.trim() || undefined),
      mappingApi.stats(),
    ]);
    set({ mappings, stats, loaded: true });
  },

  add: async (en, zhCN, zhTW) => {
    const created = await mappingApi.add(en, zhCN, zhTW);
    if (created) await get().load();
    return created;
  },

  update: async (id, en, zhCN, zhTW) => {
    const updated = await mappingApi.update(id, en, zhCN, zhTW);
    if (updated) await get().load();
    return updated;
  },

  remove: async (id) => {
    await mappingApi.remove(id);
    await get().load();
  },

  importParse: async () => {
    return mappingApi.importParse();
  },

  importRows: async (rows) => {
    const result = await mappingApi.import(rows);
    await get().load();
    return result;
  },

  setSearch: (search) => {
    set({ search });
    void get().load();
  },
}));