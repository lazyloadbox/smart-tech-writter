// Document-related types used by both main and renderer

export interface UploadedFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  parseStatus: 'pending' | 'parsing' | 'done' | 'error';
  parseError?: string;
  extractedText?: string;
  metadata?: FileMetadata;
  parseSummary?: string; // AI-generated summary of extracted content
}

export interface FileMetadata {
  title?: string;
  author?: string;
  created?: string;
  pages?: number;
  wordCount?: number;
}

export interface AnalysisResult {
  fileId: string;
  fileName: string;
  summary: string;
  keyPoints: string[];
  keywords: string[];
  technicalTerms: string[];
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  relevanceScore: number;
  snippet: string;
  matchedKeywords: string[];
}

export interface DocumentDraft {
  id: string;
  title: string;
  content: string; // Markdown
  createdAt: string;
  updatedAt: string;
}

export interface ReviewComment {
  id: string;
  draftId: string;
  type: 'suggestion' | 'error' | 'warning' | 'info';
  section?: string;
  originalText?: string;
  suggestedText?: string;
  explanation: string;
  accepted?: boolean;
}

export interface OutputDocument {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  format: 'dita' | 'docx' | 'pdf';
  size: number;
  createdAt: string;
}

/** Supported localization target languages */
export type LocalizeLanguage = 'zh-CN' | 'zh-TW' | 'zh-HK';

export const LOCALIZE_LANGUAGE_LABELS: Record<LocalizeLanguage, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文（台灣）',
  'zh-HK': '繁體中文（香港）',
};
