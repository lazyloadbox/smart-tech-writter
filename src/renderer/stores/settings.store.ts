import { create } from 'zustand';

interface SettingsStore {
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
}));
