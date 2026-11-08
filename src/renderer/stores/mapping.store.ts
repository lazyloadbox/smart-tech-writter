import { create } from 'zustand';
import type {
  GlossaryEntryKind,
  TranslationMapping,
  MappingImportParseResult,
  MappingImportPlanResult,
  MappingImportResult,
  MappingStats,
} from '../../shared/types/mapping.types';
import type { MappingImportOptionsPayload, MappingImportPlanPayload } from '../../shared/types/ipc.types';
import type {
  GlossaryIndexStatus,
  GlossarySettings,
  GlossaryTestMatchPayload,
  GlossaryTestMatchResult,
} from '../../shared/types/glossary.types';
import { mappingApi } from '../api/mapping.api';
import { glossaryApi } from '../api/glossary.api';

/** Rows per page in the glossary management table. */
export const MAPPING_PAGE_SIZE = 20;

interface MappingStore {
  /** Current page of glossary rows (server-side paging). */
  mappings: TranslationMapping[];
  total: number;
  stats: MappingStats | null;
  loaded: boolean;
  search: string;
  /** Empty string = no kind filter. */
  kind: GlossaryEntryKind | '';
  page: number;
  pageSize: number;

  load: () => Promise<void>;
  setSearch: (value: string) => void;
  setKind: (kind: GlossaryEntryKind | '') => void;
  setPage: (page: number) => void;

  add: (
    en: string,
    zhCN: string,
    zhTW: string,
    kind?: GlossaryEntryKind,
    doNotUse?: string[]
  ) => Promise<TranslationMapping | null>;
  update: (
    id: string,
    en: string,
    zhCN: string,
    zhTW: string,
    kind?: GlossaryEntryKind,
    doNotUse?: string[]
  ) => Promise<TranslationMapping | null>;
  remove: (id: string) => Promise<void>;

  importParse: () => Promise<MappingImportParseResult | null>;
  importPlan: (payload: MappingImportPlanPayload) => Promise<MappingImportPlanResult>;
  importMappings: (payload: MappingImportOptionsPayload) => Promise<MappingImportResult>;
  exportMappings: () => Promise<string | null>;

  // ── Backups + import batches (P4-1 / P4-2) ──
  backups: import('../../shared/types/mapping.types').GlossaryBackupInfo[];
  batches: import('../../shared/types/mapping.types').GlossaryImportBatchInfo[];
  loadBackups: () => Promise<void>;
  restoreBackup: (fileName: string) => Promise<number>;
  loadBatches: () => Promise<void>;
  undoBatch: (batchId: string) => Promise<{ removed: number; restored: number }>;

  // ── Glossary matching engine (P2a) ──
  glossarySettings: GlossarySettings | null;
  glossaryStatus: GlossaryIndexStatus | null;
  glossaryTest: GlossaryTestMatchResult | null;
  glossaryTestRunning: boolean;
  /** Live model progress (download/install) pushed from the main process. */
  glossaryModelProgress: import('../../shared/types/glossary.types').GlossaryModelProgress | null;
  glossaryEmbeddingProgress: import('../../shared/types/glossary.types').GlossaryEmbeddingProgress | null;
  setGlossaryStatus: (status: import('../../shared/types/glossary.types').GlossaryModelStatus) => void;
  setGlossaryModelProgress: (
    progress: import('../../shared/types/glossary.types').GlossaryModelProgress | null
  ) => void;
  setGlossaryEmbeddingProgress: (
    progress: import('../../shared/types/glossary.types').GlossaryEmbeddingProgress | null
  ) => void;
  loadGlossary: () => Promise<void>;
  saveGlossarySettings: (patch: Partial<GlossarySettings>) => Promise<void>;
  runGlossaryTest: (payload: GlossaryTestMatchPayload) => Promise<GlossaryTestMatchResult | null>;
  clearGlossaryTest: () => void;
  // ── Semantic model management (P2b) ──
  downloadModel: () => Promise<void>;
  cancelModelDownload: () => Promise<void>;
  installModelPackage: () => Promise<import('../../shared/types/glossary.types').GlossaryModelInstallOutcome>;
  installModelFolder: () => Promise<import('../../shared/types/glossary.types').GlossaryModelInstallOutcome>;
  confirmCustomModel: () => Promise<import('../../shared/types/glossary.types').GlossaryModelInstallOutcome>;
  exportModelPackage: () => Promise<{ status: 'exported' | 'cancelled'; path?: string; files?: number }>;
  verifyModel: () => Promise<void>;
  retryModel: () => Promise<void>;
  removeModel: () => Promise<void>;
  retryNativeBackend: () => Promise<void>;
  startEmbedding: () => Promise<void>;
  pauseEmbedding: () => Promise<void>;
}

export const useMappingStore = create<MappingStore>((set, get) => ({
  mappings: [],
  total: 0,
  stats: null,
  loaded: false,
  search: '',
  kind: '',
  page: 1,
  pageSize: MAPPING_PAGE_SIZE,

  load: async () => {
    const { search, kind, page, pageSize } = get();
    const [list, stats] = await Promise.all([
      mappingApi.list({
        search: search.trim() || undefined,
        kind: kind || undefined,
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
      mappingApi.stats(),
    ]);
    // A deletion on the last page may empty it — step back one page.
    if (list.items.length === 0 && page > 1 && list.total > 0) {
      set({ page: page - 1, total: list.total, stats, loaded: true });
      await get().load();
      return;
    }
    set({ mappings: list.items, total: list.total, stats, loaded: true });
  },

  setSearch: (search) => {
    set({ search, page: 1 });
    void get().load();
  },

  setKind: (kind) => {
    set({ kind, page: 1 });
    void get().load();
  },

  setPage: (page) => {
    set({ page: Math.max(1, page) });
    void get().load();
  },

  add: async (en, zhCN, zhTW, kind, doNotUse) => {
    const created = await mappingApi.add(en, zhCN, zhTW, kind, doNotUse);
    if (created) await get().load();
    return created;
  },

  update: async (id, en, zhCN, zhTW, kind, doNotUse) => {
    const updated = await mappingApi.update(id, en, zhCN, zhTW, kind, doNotUse);
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

  importPlan: async (payload) => {
    return mappingApi.importPlan(payload);
  },

  importMappings: async (payload) => {
    const result = await mappingApi.import(payload);
    set({ page: 1 });
    await get().load();
    return result;
  },

  exportMappings: async () => {
    return mappingApi.export();
  },

  // ── Backups + import batches (P4-1 / P4-2) ──

  backups: [],
  batches: [],

  loadBackups: async () => {
    const items = await mappingApi.backups();
    set({ backups: items });
  },

  restoreBackup: async (fileName) => {
    const result = await mappingApi.restore(fileName);
    set({ page: 1 });
    await get().load();
    await get().loadBackups();
    return result.restored;
  },

  loadBatches: async () => {
    const items = await mappingApi.batches();
    set({ batches: items });
  },

  undoBatch: async (batchId) => {
    const result = await mappingApi.batchUndo(batchId);
    set({ page: 1 });
    await get().load();
    await get().loadBatches();
    return { removed: result.removed, restored: result.restored };
  },

  glossarySettings: null,
  glossaryStatus: null,
  glossaryTest: null,
  glossaryTestRunning: false,
  glossaryModelProgress: null,
  glossaryEmbeddingProgress: null,

  setGlossaryStatus: (status) =>
    set((state) => ({
      glossaryStatus: state.glossaryStatus ? { ...state.glossaryStatus, model: status } : state.glossaryStatus,
    })),
  setGlossaryModelProgress: (progress) => set({ glossaryModelProgress: progress }),
  setGlossaryEmbeddingProgress: (progress) => set({ glossaryEmbeddingProgress: progress }),

  loadGlossary: async () => {
    const [settings, status] = await Promise.all([
      glossaryApi.getSettings(),
      glossaryApi.indexStatus(),
    ]);
    set({ glossarySettings: settings, glossaryStatus: status });
  },

  saveGlossarySettings: async (patch) => {
    const settings = await glossaryApi.setSettings(patch);
    const status = await glossaryApi.indexStatus();
    set({ glossarySettings: settings, glossaryStatus: status });
  },

  runGlossaryTest: async (payload) => {
    set({ glossaryTestRunning: true });
    try {
      const result = await glossaryApi.testMatch(payload);
      set({ glossaryTest: result });
      return result;
    } finally {
      set({ glossaryTestRunning: false });
    }
  },

  clearGlossaryTest: () => set({ glossaryTest: null }),

  // ── Semantic model management (P2b) ──

  downloadModel: async () => {
    await glossaryApi.modelDownload();
    await get().loadGlossary();
  },

  cancelModelDownload: async () => {
    await glossaryApi.modelCancel();
    await get().loadGlossary();
  },

  installModelPackage: async () => {
    const outcome = await glossaryApi.modelInstallPackage();
    await get().loadGlossary();
    return outcome;
  },

  installModelFolder: async () => {
    const outcome = await glossaryApi.modelInstallFolder();
    await get().loadGlossary();
    return outcome;
  },

  confirmCustomModel: async () => {
    const outcome = await glossaryApi.modelConfirmCustom();
    await get().loadGlossary();
    return outcome;
  },

  exportModelPackage: async () => glossaryApi.modelExportPackage(),

  verifyModel: async () => {
    await glossaryApi.modelVerify();
    await get().loadGlossary();
  },

  retryModel: async () => {
    await glossaryApi.modelRetry();
    await get().loadGlossary();
  },

  removeModel: async () => {
    await glossaryApi.modelRemove();
    await get().loadGlossary();
  },

  retryNativeBackend: async () => {
    await glossaryApi.modelClearNativeFailure();
    await get().loadGlossary();
  },

  startEmbedding: async () => {
    const progress = await glossaryApi.embeddingStart();
    set({ glossaryEmbeddingProgress: progress });
    await get().loadGlossary();
  },

  pauseEmbedding: async () => {
    const progress = await glossaryApi.embeddingPause();
    set({ glossaryEmbeddingProgress: progress });
  },
}));
