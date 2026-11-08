import type { ResponseFormat } from './base.provider';
import type {
  AnalysisResult,
  AnalysisBundle,
  FileExtractionResult,
  ExtractedItem,
  GlossaryTermCandidate,
  ReviewComment,
} from '../../../shared/types/document.types';
import type { GlossaryAdjudicationResult } from '../../../shared/types/glossary.types';

export type JsonSchema = Record<string, unknown>;

export interface StructuredOutputContract<T> {
  name: string;
  schema: JsonSchema;
  parse(value: unknown): T | null;
}

const nullableString = { type: ['string', 'null'] };

/** One technical concept spotted in the source material (L5a). */
const termCandidateSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    surface: { type: 'string' },
    lang: { type: ['string', 'null'], enum: ['en', 'zh', 'mixed', null] },
    englishGuess: nullableString,
    context: nullableString,
  },
  required: ['surface', 'lang', 'englishGuess', 'context'],
};

const extractedItemSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: ['fact', 'specification', 'requirement', 'procedure', 'component', 'interface', 'dependency', 'constraint', 'warning', 'example', 'term', 'other'] },
    title: { type: 'string' },
    content: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
    },
    sourceQuote: nullableString,
    sourceLocation: nullableString,
    importance: { type: 'string', enum: ['critical', 'high', 'normal'] },
  },
  required: ['category', 'title', 'content', 'details', 'sourceQuote', 'sourceLocation', 'importance'],
};

export const fileExtractionContract: StructuredOutputContract<FileExtractionResult> = {
  name: 'file_extraction_result',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      fileId: { type: 'string' },
      fileName: { type: 'string' },
      overview: { type: 'string' },
      items: { type: 'array', items: extractedItemSchema },
      terminology: { type: 'array', items: { type: 'string' } },
      terms: { type: 'array', maxItems: 120, items: termCandidateSchema },
      conflicts: { type: 'array', items: { type: 'string' } },
      unresolved: { type: 'array', items: { type: 'string' } },
      markdown: { type: 'string' },
      coverage: {
        type: 'object',
        additionalProperties: false,
        properties: { totalChunks: { type: 'integer', minimum: 0 }, processedChunks: { type: 'integer', minimum: 0 } },
        required: ['totalChunks', 'processedChunks'],
      },
    },
    required: ['fileId', 'fileName', 'overview', 'items', 'terminology', 'terms', 'conflicts', 'unresolved', 'coverage', 'markdown'],
  },
  parse: parseFileExtraction,
};

const analysisSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fileId: { type: 'string' },
    fileName: { type: 'string' },
    summary: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    technicalTerms: { type: 'array', items: { type: 'string' } },
    extractedItems: { type: 'array', items: extractedItemSchema },
    markdown: { type: 'string' },
  },
  required: ['fileId', 'fileName', 'summary', 'keyPoints', 'keywords', 'technicalTerms', 'extractedItems', 'markdown'],
};

export const analysisResultsContract: StructuredOutputContract<AnalysisBundle> = {
  name: 'analysis_bundle',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      results: { type: 'array', items: analysisSchema },
      synthesisMarkdown: { type: 'string' },
    },
    required: ['results', 'synthesisMarkdown'],
  },
  parse: (value) => {
    if (!isRecord(value) || !Array.isArray(value.results) || typeof value.synthesisMarkdown !== 'string') return null;
    const parsed = value.results.map(parseAnalysisResult);
    return parsed.every((v): v is AnalysisResult => v !== null)
      ? { results: parsed, synthesisMarkdown: value.synthesisMarkdown }
      : null;
  },
};

const reviewSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    draftId: { type: 'string' },
    type: { type: 'string', enum: ['suggestion', 'error', 'warning', 'info'] },
    section: nullableString,
    originalText: nullableString,
    suggestedText: nullableString,
    explanation: { type: 'string' },
  },
  required: ['draftId', 'type', 'section', 'originalText', 'suggestedText', 'explanation'],
};

export const reviewCommentsContract: StructuredOutputContract<ReviewComment[]> = {
  name: 'review_comments',
  schema: { type: 'array', items: reviewSchema, maxItems: 50 },
  parse: (value) => {
    if (!Array.isArray(value)) return null;
    const parsed = value.map(parseReviewComment);
    return parsed.every((v): v is ReviewComment => v !== null) ? parsed : null;
  },
};

/** L5a term extraction (standalone fallback when FileParser produced no terms). */
export const glossaryTermsContract: StructuredOutputContract<GlossaryTermCandidate[]> = {
  name: 'glossary_terms',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { terms: { type: 'array', maxItems: 120, items: termCandidateSchema } },
    required: ['terms'],
  },
  parse: (value) => (isRecord(value) && Array.isArray(value.terms) ? parseTermCandidates(value.terms) : null),
};

/** L5b gray-zone adjudication verdicts. */
export const glossaryAdjudicationContract: StructuredOutputContract<GlossaryAdjudicationResult[]> = {
  name: 'glossary_adjudication',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      results: {
        type: 'array',
        maxItems: 60,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            candidateId: { type: 'string' },
            entryId: nullableString,
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: nullableString,
          },
          required: ['candidateId', 'entryId', 'confidence', 'reason'],
        },
      },
    },
    required: ['results'],
  },
  parse: (value) => {
    if (!isRecord(value) || !Array.isArray(value.results)) return null;
    const results: GlossaryAdjudicationResult[] = [];
    for (const item of value.results) {
      if (!isRecord(item) || typeof item.candidateId !== 'string') return null;
      results.push({
        candidateId: item.candidateId,
        entryId: typeof item.entryId === 'string' ? item.entryId : null,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
        reason: nullableStringValue(item.reason),
      });
    }
    return results;
  },
};

export function toResponseFormat(contract: StructuredOutputContract<unknown>): ResponseFormat {
  return {
    type: 'json_schema',
    json_schema: { name: contract.name, schema: contract.schema, strict: true },
  };
}
function parseFileExtraction(value: unknown): FileExtractionResult | null {
  if (!isRecord(value)) return null;
  const coverage = isRecord(value.coverage) ? value.coverage : null;
  const parsedItems = Array.isArray(value.items) ? value.items.map(parseExtractedItem) : null;
  const items = parsedItems && parsedItems.every((v): v is ExtractedItem => v !== null) ? parsedItems : null;
  if (!items || !coverage || typeof value.fileId !== 'string' || typeof value.fileName !== 'string' || typeof value.overview !== 'string') return null;
  if (!Number.isInteger(coverage.totalChunks) || !Number.isInteger(coverage.processedChunks)) return null;
  const totalChunks = coverage.totalChunks as number;
  const processedChunks = coverage.processedChunks as number;
  return {
    fileId: value.fileId,
    fileName: value.fileName,
    overview: value.overview,
    items,
    terminology: stringArray(value.terminology),
    terms: parseTermCandidates(value.terms),
    conflicts: stringArray(value.conflicts),
    unresolved: stringArray(value.unresolved),
    markdown: typeof value.markdown === 'string' ? value.markdown : undefined,
    coverage: { totalChunks, processedChunks },
  };
}

function parseAnalysisResult(value: unknown): AnalysisResult | null {
  if (!isRecord(value) || typeof value.fileId !== 'string' || typeof value.fileName !== 'string' || typeof value.summary !== 'string') return null;
  const extractedItems = Array.isArray(value.extractedItems)
    ? value.extractedItems.map(parseExtractedItem).filter((v): v is ExtractedItem => v !== null)
    : [];
  return {
    fileId: value.fileId,
    fileName: value.fileName,
    summary: value.summary,
    keyPoints: stringArray(value.keyPoints),
    keywords: stringArray(value.keywords),
    technicalTerms: stringArray(value.technicalTerms),
    extractedItems,
    markdown: typeof value.markdown === 'string' ? value.markdown : undefined,
  };
}

function parseReviewComment(value: unknown): ReviewComment | null {
  if (!isRecord(value) || typeof value.draftId !== 'string' || typeof value.type !== 'string' || typeof value.explanation !== 'string') return null;
  if (!['suggestion', 'error', 'warning', 'info'].includes(value.type)) return null;
  return {
    id: '',
    draftId: value.draftId,
    type: value.type as ReviewComment['type'],
    section: nullableStringValue(value.section),
    originalText: nullableStringValue(value.originalText),
    suggestedText: nullableStringValue(value.suggestedText),
    explanation: value.explanation,
    accepted: false,
  };
}

function parseExtractedItem(value: unknown): ExtractedItem | null {
  if (!isRecord(value) || typeof value.category !== 'string' || typeof value.title !== 'string' || typeof value.content !== 'string' || typeof value.importance !== 'string') return null;
  if (!['fact', 'specification', 'requirement', 'procedure', 'component', 'interface', 'dependency', 'constraint', 'warning', 'example', 'term', 'other'].includes(value.category)) return null;
  if (!['critical', 'high', 'normal'].includes(value.importance)) return null;
  const details = Array.isArray(value.details)
    ? value.details.filter(isRecord).filter((d) => typeof d.key === 'string' && typeof d.value === 'string').map((d) => ({ key: d.key as string, value: d.value as string }))
    : [];
  return {
    category: value.category as ExtractedItem['category'],
    title: value.title,
    content: value.content,
    details,
    sourceQuote: nullableStringValue(value.sourceQuote),
    sourceLocation: nullableStringValue(value.sourceLocation),
    importance: value.importance as ExtractedItem['importance'],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
function nullableStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Tolerant L5a term candidate list parser (drops malformed entries). */
function parseTermCandidates(value: unknown): GlossaryTermCandidate[] {
  if (!Array.isArray(value)) return [];
  const output: GlossaryTermCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.surface !== 'string') continue;
    const surface = item.surface.trim();
    if (!surface) continue;
    const lang = item.lang === 'en' || item.lang === 'zh' || item.lang === 'mixed' ? item.lang : undefined;
    output.push({
      surface,
      lang,
      englishGuess: nullableStringValue(item.englishGuess)?.trim() || undefined,
      context: nullableStringValue(item.context)?.trim() || undefined,
    });
  }
  return output;
}
