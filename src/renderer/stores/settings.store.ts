import { create } from 'zustand';
import type {
  PromptCatalogEntry,
  PromptKey,
  PromptOverride,
  PromptOverrides,
} from '../../shared/types/prompts.types';

/** 单个提示词的编辑态（三个组成部分） */
export interface PromptEditState {
  role: string;
  task: string;
  outputFormat: string;
}

interface SettingsStore {
  // --- AI 服务配置 ---
  openaiApiKey: string;
  openaiBaseURL: string;
  openaiModel: string;
  ragSearchDirectory: string;
  setOpenaiApiKey: (key: string) => void;
  setOpenaiBaseURL: (url: string) => void;
  setOpenaiModel: (model: string) => void;
  setRagSearchDirectory: (dir: string) => void;
  loadFromIpc: () => Promise<void>;
  saveToIpc: () => Promise<void>;

  // --- 提示词设置 ---
  promptCatalog: PromptCatalogEntry[];
  /** 按提示词键的编辑态（未编辑的键不存在） */
  promptEdits: Partial<Record<PromptKey, PromptEditState>>;
  promptsLoaded: boolean;
  loadPromptsFromIpc: () => Promise<void>;
  setPromptPart: (key: PromptKey, part: keyof PromptEditState, value: string) => void;
  /** 将当前编辑态与默认值做 diff，仅保存有差异的部分 */
  savePromptsToIpc: () => Promise<void>;
  /** 恢复所有提示词为默认值 */
  resetPrompts: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  openaiApiKey: '',
  openaiBaseURL: '',
  openaiModel: 'gpt-4o',
  ragSearchDirectory: '',
  setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
  setOpenaiBaseURL: (url) => set({ openaiBaseURL: url }),
  setOpenaiModel: (model) => set({ openaiModel: model }),
  setRagSearchDirectory: (dir) => set({ ragSearchDirectory: dir }),

  loadFromIpc: async () => {
    const api = window.electronAPI.settings;
    const [apiKey, baseURL, model, ragDir] = await Promise.all([
      api.get('openai.apiKey'),
      api.get('openai.baseURL'),
      api.get('openai.model'),
      api.get('rag.searchDirectory'),
    ]);
    set({
      openaiApiKey: String(apiKey ?? ''),
      openaiBaseURL: String(baseURL ?? ''),
      openaiModel: String(model ?? 'gpt-4o'),
      ragSearchDirectory: String(ragDir ?? ''),
    });
  },

  saveToIpc: async () => {
    const { openaiApiKey, openaiBaseURL, openaiModel, ragSearchDirectory } = get();
    const api = window.electronAPI.settings;
    await Promise.all([
      api.set({ key: 'openai.apiKey', value: openaiApiKey }),
      api.set({ key: 'openai.baseURL', value: openaiBaseURL }),
      api.set({ key: 'openai.model', value: openaiModel }),
      api.set({ key: 'rag.searchDirectory', value: ragSearchDirectory }),
    ]);
    await api.reloadProvider();
  },

  // --- 提示词设置 ---
  promptCatalog: [],
  promptEdits: {},
  promptsLoaded: false,

  loadPromptsFromIpc: async () => {
    const { catalog, overrides } = await window.electronAPI.prompts.get();
    // 用默认值初始化编辑态，再叠加已保存的覆盖
    const edits: Partial<Record<PromptKey, PromptEditState>> = {};
    for (const entry of catalog) {
      const saved = overrides[entry.key];
      edits[entry.key] = {
        role: saved?.role ?? entry.default.role,
        task: saved?.task ?? entry.default.task,
        outputFormat: saved?.outputFormat ?? entry.default.outputFormat,
      };
    }
    set({ promptCatalog: catalog, promptEdits: edits, promptsLoaded: true });
  },

  setPromptPart: (key, part, value) => {
    const current = get().promptEdits[key];
    if (!current) return;
    set({
      promptEdits: {
        ...get().promptEdits,
        [key]: { ...current, [part]: value },
      },
    });
  },

  savePromptsToIpc: async () => {
    const { promptCatalog, promptEdits } = get();
    const overrides: PromptOverrides = {};
    for (const entry of promptCatalog) {
      const edit = promptEdits[entry.key];
      if (!edit) continue;
      const override: PromptOverride = {};
      if (edit.role !== entry.default.role) override.role = edit.role;
      if (edit.task !== entry.default.task) override.task = edit.task;
      if (edit.outputFormat !== entry.default.outputFormat) override.outputFormat = edit.outputFormat;
      if (Object.keys(override).length > 0) overrides[entry.key] = override;
    }
    await window.electronAPI.prompts.set(overrides);
  },

  resetPrompts: async () => {
    await window.electronAPI.prompts.reset();
    // 重新加载（编辑态回到默认值）
    await get().loadPromptsFromIpc();
  },
}));
