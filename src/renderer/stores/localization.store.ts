import { create } from 'zustand';
import type { LocalizeLanguage } from '../../shared/types/document.types';
import type {
  LocalizationFileResult,
  LocalizationStage,
  LocalizationStatus,
} from '../../shared/types/localization.types';

export interface LocalizeStreamChunk {
  fileName: string;
  type: 'thinking' | 'content';
  text: string;
  timestamp: number;
}

export interface LocalizeLogEntry {
  id: string;
  timestamp: number;
  fileName: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface LocalizationStore {
  files: string[];
  targetLanguage: LocalizeLanguage;
  status: LocalizationStatus;
  /** Current workflow stage (drives which view is shown). */
  stage: LocalizationStage;
  /** File currently being processed (drives the streaming viewer). */
  currentFile: string | null;
  results: LocalizationFileResult[];
  streamChunks: LocalizeStreamChunk[];
  logs: LocalizeLogEntry[];
  exportResult: { destDir: string; count: number } | null;
  setFiles: (files: string[]) => void;
  setTargetLanguage: (lang: LocalizeLanguage) => void;
  setStatus: (status: LocalizationStatus) => void;
  setStage: (stage: LocalizationStage) => void;
  setCurrentFile: (fileName: string | null) => void;
  setResults: (results: LocalizationFileResult[]) => void;
  appendStreamChunk: (chunk: LocalizeStreamChunk) => void;
  appendLog: (entry: Omit<LocalizeLogEntry, 'id' | 'timestamp'>) => void;
  setExportResult: (result: { destDir: string; count: number } | null) => void;
  reset: () => void;
}

const initialState = {
  files: [] as string[],
  targetLanguage: 'zh-CN' as LocalizeLanguage,
  status: 'idle' as LocalizationStatus,
  stage: 'localize' as LocalizationStage,
  currentFile: null as string | null,
  results: [] as LocalizationFileResult[],
  streamChunks: [] as LocalizeStreamChunk[],
  logs: [] as LocalizeLogEntry[],
  exportResult: null as { destDir: string; count: number } | null,
};

export const useLocalizationStore = create<LocalizationStore>((set) => ({
  ...initialState,
  setFiles: (files) => set({ files }),
  setTargetLanguage: (targetLanguage) => set({ targetLanguage }),
  setStatus: (status) => set({ status }),
  setStage: (stage) => set({ stage }),
  setCurrentFile: (currentFile) => set({ currentFile }),
  setResults: (results) => set({ results }),
  appendStreamChunk: (chunk) => set((s) => ({ streamChunks: [...s.streamChunks, chunk] })),
  appendLog: (entry) =>
    set((s) => ({
      logs: [...s.logs, { ...entry, id: crypto.randomUUID(), timestamp: Date.now() }],
    })),
  setExportResult: (exportResult) => set({ exportResult }),
  reset: () => set({ ...initialState }),
}));
