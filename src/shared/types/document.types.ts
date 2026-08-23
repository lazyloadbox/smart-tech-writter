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
  /**
   * 用户为该文件单独指定的解析提示词（特殊处理），优先级高于全局解析提示词。
   * 用于指导文件解析 Agent 的解析思路、重点与分析设计。
   */
  parseInstruction?: string;
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

/**
 * 文档大纲：控制文档撰写阶段的章节结构（可自定义，不再固定模板）。
 * - sections：章节标题列表，按顺序生成文档结构
 * - mergeIntoSingle：是否将多文件分析结果合并为单一文档
 */
export interface DocumentOutline {
  sections: string[];
  mergeIntoSingle: boolean;
}

/**
 * Supported localization target languages.
 * 仅支持：英文 / 简体中文 / 台湾繁体中文（已移除香港繁体）。
 */
export type LocalizeLanguage = 'en' | 'zh-CN' | 'zh-TW';

export const LOCALIZE_LANGUAGE_LABELS: Record<LocalizeLanguage, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文（台灣）',
};
