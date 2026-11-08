import type {
  GlossaryEmbeddingProgress,
  GlossaryEntryView,
  GlossaryIndexStatus,
  GlossaryModelInstallOutcome,
  GlossaryModelProgress,
  GlossaryModelStatus,
  GlossarySettings,
  GlossaryTestMatchPayload,
  GlossaryTestMatchResult,
  GlossaryUsageReport,
  GlossaryUsageReportPayload,
} from '../../shared/types/glossary.types';

function getElectronApi() {
  if (!window.electronAPI) throw new Error('electronAPI is unavailable — running outside Electron?');
  return window.electronAPI;
}

/** Renderer-side wrapper for the glossary matching engine IPC (P2a). */
export const glossaryApi = {
  getSettings: async (): Promise<GlossarySettings> => {
    return getElectronApi().glossary.getSettings();
  },
  setSettings: async (patch: Partial<GlossarySettings>): Promise<GlossarySettings> => {
    const settings = await getElectronApi().glossary.setSettings(patch);
    console.info('[Glossary][API] settings saved', { keys: Object.keys(patch) });
    return settings;
  },
  indexStatus: async (): Promise<GlossaryIndexStatus> => {
    return getElectronApi().glossary.indexStatus();
  },
  testMatch: async (payload: GlossaryTestMatchPayload): Promise<GlossaryTestMatchResult> => {
    const result = await getElectronApi().glossary.testMatch(payload);
    console.info('[Glossary][API] testMatch', {
      hits: result.hits.length,
      tokens: result.tokens,
      elapsedMs: result.elapsedMs,
    });
    return result;
  },
  /** Batch entry lookup for the glossary hit panel (P3). */
  entries: async (ids: string[]): Promise<GlossaryEntryView[]> => {
    if (ids.length === 0) return [];
    return getElectronApi().glossary.entries(ids);
  },

  /** P4-4: terminology usage report for the final document. */
  usageReport: async (payload: GlossaryUsageReportPayload): Promise<GlossaryUsageReport> => {
    const result = await getElectronApi().glossary.usageReport(payload);
    console.info('[Glossary][API] usageReport', {
      total: result.total,
      used: result.used,
      variantOnly: result.variantOnly,
      missing: result.missing,
      forbidden: result.forbidden,
    });
    return result;
  },

  // ── Semantic model management (P2b) ──

  modelDownload: async (sourceIndex = 0): Promise<GlossaryModelStatus> =>
    getElectronApi().glossary.modelDownload({ sourceIndex }),
  modelCancel: async (): Promise<GlossaryModelStatus> => getElectronApi().glossary.modelCancel(),
  modelInstallPackage: async (): Promise<GlossaryModelInstallOutcome> =>
    getElectronApi().glossary.modelInstallPackage(),
  modelInstallFolder: async (): Promise<GlossaryModelInstallOutcome> =>
    getElectronApi().glossary.modelInstallFolder(),
  modelConfirmCustom: async (): Promise<GlossaryModelInstallOutcome> =>
    getElectronApi().glossary.modelConfirmCustom(),
  modelExportPackage: async (): Promise<{ status: 'exported' | 'cancelled'; path?: string; files?: number }> =>
    getElectronApi().glossary.modelExportPackage(),
  modelVerify: async (): Promise<GlossaryModelStatus> => getElectronApi().glossary.modelVerify(),
  modelRetry: async (): Promise<GlossaryModelStatus> => getElectronApi().glossary.modelRetry(),
  modelRemove: async (): Promise<GlossaryModelStatus> => getElectronApi().glossary.modelRemove(),
  modelClearNativeFailure: async (): Promise<GlossaryModelStatus> =>
    getElectronApi().glossary.modelClearNativeFailure(),
  embeddingStart: async (): Promise<GlossaryEmbeddingProgress> =>
    getElectronApi().glossary.embeddingStart(),
  embeddingPause: async (): Promise<GlossaryEmbeddingProgress> =>
    getElectronApi().glossary.embeddingPause(),

  onModelProgress: (cb: (progress: GlossaryModelProgress) => void): (() => void) =>
    getElectronApi().glossary.onModelProgress(cb),
  onEmbeddingProgress: (cb: (progress: GlossaryEmbeddingProgress) => void): (() => void) =>
    getElectronApi().glossary.onEmbeddingProgress(cb),
  onStatusChanged: (cb: (status: GlossaryModelStatus) => void): (() => void) =>
    getElectronApi().glossary.onStatusChanged(cb),
};
