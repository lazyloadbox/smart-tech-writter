import { create } from 'zustand';
import type {
  PromptCatalogEntry,
  PromptKey,
  PromptOverride,
  PromptOverrides,
} from '../../shared/types/prompts.types';
import type { ReasoningEffort } from '../../main/modules/ai-providers/base.provider';

/** Migrate old full-Markdown/legacy prompt settings without importing output format. */
function resolvePromptEdit(entry: PromptCatalogEntry, saved?: PromptOverride): PromptEditState {
  const raw = (saved ?? {}) as PromptOverride & Record<string, unknown>;
  const legacySource = typeof raw.content === 'string' ? raw.content : typeof raw.system === 'string' ? raw.system : '';
  const sections = splitPromptSections(legacySource);
  return {
    role: typeof raw.role === 'string' ? raw.role : sections.role || entry.default.role,
    instructions:
      typeof raw.instructions === 'string'
        ? raw.instructions
        : typeof raw.task === 'string'
          ? raw.task
          : sections.task || entry.default.instructions,
  };
}

function splitPromptSections(content: string): {
  role: string;
  task: string;
} {
  const headings = [...content.matchAll(/^##\s+(.+?)\s*$/gim)];
  const read = (heading: string): string => {
    const current = headings.find((match) => match[1].trim().toLowerCase() === heading.toLowerCase());
    if (!current || current.index === undefined) return '';
    const currentIndex = current.index;
    const start = currentIndex + current[0].length;
    const next = headings.find((match) => (match.index ?? 0) > currentIndex);
    return content.slice(start, next?.index ?? content.length).trim();
  };
  return {
    role: read('Role Definition'),
    task: read('Task'),
  };
}

/** Editable state for one prompt. The output contract is intentionally absent. */
export interface PromptEditState {
  role: string;
  instructions: string;
}

interface SettingsStore {
  // --- AI service configuration ---
  openaiApiKey: string;
  openaiBaseURL: string;
  openaiModel: string;
  openaiReasoningEffort: ReasoningEffort;
  ragSearchDirectory: string;
  setOpenaiApiKey: (key: string) => void;
  setOpenaiBaseURL: (url: string) => void;
  setOpenaiModel: (model: string) => void;
  setOpenaiReasoningEffort: (effort: ReasoningEffort) => void;
  setRagSearchDirectory: (dir: string) => void;
  loadFromIpc: () => Promise<void>;
  saveToIpc: () => Promise<void>;

  // --- Prompt settings ---
  promptCatalog: PromptCatalogEntry[];
  /** Editable state keyed by prompt (unmodified prompts are omitted). */
  promptEdits: Partial<Record<PromptKey, PromptEditState>>;
  promptsLoaded: boolean;
  loadPromptsFromIpc: () => Promise<void>;
  setPromptRole: (key: PromptKey, value: string) => void;
  setPromptInstructions: (key: PromptKey, value: string) => void;
  savePrompt: (key: PromptKey, edit: PromptEditState) => Promise<void>;
  /** Diff the current edits against defaults and persist only changed prompts. */
  savePromptsToIpc: () => Promise<void>;
  /** Restore all prompts to their defaults. */
  resetPrompts: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  openaiApiKey: '',
  openaiBaseURL: '',
  openaiModel: 'gpt-4o',
  openaiReasoningEffort: 'medium',
  ragSearchDirectory: '',
  setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
  setOpenaiBaseURL: (url) => set({ openaiBaseURL: url }),
  setOpenaiModel: (model) => set({ openaiModel: model }),
  setOpenaiReasoningEffort: (effort) => set({ openaiReasoningEffort: effort }),
  setRagSearchDirectory: (dir) => set({ ragSearchDirectory: dir }),

  loadFromIpc: async () => {
    const api = window.electronAPI.settings;
    const [apiKey, baseURL, model, reasoningEffort, ragDir] = await Promise.all([
      api.get('openai.apiKey'),
      api.get('openai.baseURL'),
      api.get('openai.model'),
      api.get('openai.reasoningEffort'),
      api.get('rag.searchDirectory'),
    ]);
    set({
      openaiApiKey: String(apiKey ?? ''),
      openaiBaseURL: String(baseURL ?? ''),
      openaiModel: String(model ?? 'gpt-4o'),
      openaiReasoningEffort: (['none', 'low', 'medium', 'high'].includes(String(reasoningEffort))
        ? String(reasoningEffort)
        : 'medium') as ReasoningEffort,
      ragSearchDirectory: String(ragDir ?? ''),
    });
  },

  saveToIpc: async () => {
    const { openaiApiKey, openaiBaseURL, openaiModel, openaiReasoningEffort, ragSearchDirectory } = get();
    const api = window.electronAPI.settings;
    await Promise.all([
      api.set({ key: 'openai.apiKey', value: openaiApiKey }),
      api.set({ key: 'openai.baseURL', value: openaiBaseURL }),
      api.set({ key: 'openai.model', value: openaiModel }),
      api.set({ key: 'openai.reasoningEffort', value: openaiReasoningEffort }),
      api.set({ key: 'rag.searchDirectory', value: ragSearchDirectory }),
    ]);
    await api.reloadProvider();
  },

  // --- Prompt settings ---
  promptCatalog: [],
  promptEdits: {},
  promptsLoaded: false,

  loadPromptsFromIpc: async () => {
    const { catalog, overrides } = await window.electronAPI.prompts.get();
    // Initialize edits from defaults, then apply persisted overrides.
    const edits: Partial<Record<PromptKey, PromptEditState>> = {};
    for (const entry of catalog) {
      const saved = overrides[entry.key];
      edits[entry.key] = resolvePromptEdit(entry, saved);
    }
    set({ promptCatalog: catalog, promptEdits: edits, promptsLoaded: true });
  },

  setPromptRole: (key, value) => {
    const current = get().promptEdits[key];
    if (!current) return;
    set({
      promptEdits: {
        ...get().promptEdits,
        [key]: { ...current, role: value },
      },
    });
  },

  setPromptInstructions: (key, value) => {
    const current = get().promptEdits[key];
    if (!current) return;
    set({
      promptEdits: {
        ...get().promptEdits,
        [key]: { ...current, instructions: value },
      },
    });
  },

  savePrompt: async (key, edit) => {
    const { promptCatalog, promptEdits } = get();
    const overrides: PromptOverrides = {};
    for (const entry of promptCatalog) {
      const current = entry.key === key ? edit : promptEdits[entry.key];
      if (!current) continue;
      const override: PromptOverride = {};
      if (current.role !== entry.default.role) override.role = current.role;
      if (current.instructions !== entry.default.instructions) override.instructions = current.instructions;
      if (Object.keys(override).length > 0) overrides[entry.key] = override;
    }
    await window.electronAPI.prompts.set(overrides);
    await get().loadPromptsFromIpc();
  },

  savePromptsToIpc: async () => {
    const { promptCatalog, promptEdits } = get();
    const overrides: PromptOverrides = {};
    for (const entry of promptCatalog) {
      const edit = promptEdits[entry.key];
      if (!edit) continue;
      const override: PromptOverride = {};
      if (edit.role !== entry.default.role) override.role = edit.role;
      if (edit.instructions !== entry.default.instructions) override.instructions = edit.instructions;
      if (Object.keys(override).length > 0) overrides[entry.key] = override;
    }
    await window.electronAPI.prompts.set(overrides);
    // Read back after writing so the UI reflects the actual persisted values.
    // This also prevents a later save from using stale renderer state.
    await get().loadPromptsFromIpc();
  },

  resetPrompts: async () => {
    await window.electronAPI.prompts.reset();
    // Reload and reset editable state to defaults.
    await get().loadPromptsFromIpc();
  },
}));
