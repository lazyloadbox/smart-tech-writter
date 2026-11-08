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
  /** Short orientation text; detailed evidence lives in parseExtraction.items. */
  parseSummary?: string;
  /** Evidence-first extraction preserved for downstream analysis and review. */
  parseExtraction?: FileExtractionResult;
  /** Complete, human-reviewable Markdown extraction. This is the downstream source of truth. */
  parseMarkdown?: string;
  /**
   * 用户为该文件单独指定的解析提示词（特殊处理），优先级高于全局解析提示词。
   * 用于指导文件解析 Agent 的解析思路、重点与分析设计。
   */
  parseInstruction?: string;
}

export type ExtractedItemCategory =
  | 'fact'
  | 'specification'
  | 'requirement'
  | 'procedure'
  | 'component'
  | 'interface'
  | 'dependency'
  | 'constraint'
  | 'warning'
  | 'example'
  | 'term'
  | 'other';

export interface ExtractedDetail {
  key: string;
  value: string;
}

export interface ExtractedItem {
  category: ExtractedItemCategory;
  title: string;
  content: string;
  details: ExtractedDetail[];
  sourceQuote?: string;
  sourceLocation?: string;
  importance: 'critical' | 'high' | 'normal';
}

/**
 * A technical concept the parser spotted in the source material (L5a).
 * `englishGuess` is what makes the English side retrievable when the source
 * uses colloquial wording (design §2.5.7).
 */
export interface GlossaryTermCandidate {
  /** Concept as it appears in the source text. */
  surface: string;
  lang?: 'en' | 'zh' | 'mixed';
  /** Model's guess at the English term, used to query the glossary. */
  englishGuess?: string;
  /** Short surrounding context for adjudication. */
  context?: string;
}

export interface FileExtractionResult {
  fileId: string;
  fileName: string;
  overview: string;
  items: ExtractedItem[];
  terminology: string[];
  /** Structured concepts for glossary matching (L5a, optional). */
  terms?: GlossaryTermCandidate[];
  conflicts: string[];
  unresolved: string[];
  /** Complete Markdown artifact used for review and downstream transfer. */
  markdown?: string;
  coverage: {
    totalChunks: number;
    processedChunks: number;
  };
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
  /** Structured evidence carried forward from file parsing when available. */
  extractedItems?: ExtractedItem[];
  /** Complete analytical Markdown artifact used by the writer and review UI. */
  markdown?: string;
}

/** Cross-file synthesis produced after the per-file analytical pass. */
export interface AnalysisBundle {
  results: AnalysisResult[];
  synthesisMarkdown: string;
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
  /**
   * Source of the comment (P3, design §2.8.4).
   * - `ai` (default): produced by the AI reviewer.
   * - `glossary`: produced by the deterministic glossary rule layer.
   * Old persisted comments have no value and are treated as `ai`.
   */
  origin?: 'ai' | 'glossary';
  /** Glossary entry id when `origin === 'glossary'` (useful for de-duplication). */
  glossaryEntryId?: string;
}

export interface OutputDocument {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  format: 'dita' | 'docx' | 'pdf';
  size: number;
  createdAt: string;
  /** Id of the source `DocumentDraft` in `ditaDocuments` (P3/S2 split export). */
  documentId?: string;
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
  'zh-CN': 'Simplified Chinese (China)',
  'zh-TW': 'Traditional Chinese (Taiwan)',
};
