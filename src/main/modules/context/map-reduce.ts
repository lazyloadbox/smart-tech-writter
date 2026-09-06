import type { AIProvider } from '../ai-providers/base.provider';
import { chunkText } from '../file-readers/base.reader';
import { PROMPTS, buildSystemPrompt, buildMapUserPrompt, buildReduceUserPrompt } from '../prompts';
import type { PromptOverrides } from '../prompts';
import { en as ui, formatUi } from '../../../shared/i18n';

export interface SummarizeOptions {
  provider: AIProvider;
  /** Max characters per chunk before map-reduce kicks in. */
  chunkSize?: number;
  /** Overlap between consecutive chunks. */
  overlap?: number;
  /** @deprecated Kept for API compatibility; exhaustive extraction processes every chunk. */
  maxChunks?: number;
  /** AbortSignal to cancel in-flight extraction calls (pause / go-back). */
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /** 提示词覆盖：map / reduce 的 system prompt 可被用户配置覆盖。 */
  promptOverrides?: PromptOverrides;
  /** 用户解析提示词：注入 map / reduce 的 user prompt，指导提取重点与分析设计。 */
  instruction?: string;
}
/**
 * Map-reduce extraction for long documents (fixes R2).
 *
 * Short texts (<= chunkSize) are returned unchanged. Longer texts are split
 * into overlapping chunks, each chunk is exhaustively extracted (map), and the
 * per-chunk extraction notes are merged (reduce). Every chunk is processed;
 * sampling is intentionally avoided because it can silently omit key facts.
 */
export async function summarizeLongText(text: string, opts: SummarizeOptions): Promise<string> {
  const { provider, chunkSize = 4000, overlap = 200, signal, onProgress, promptOverrides, instruction } = opts;
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= chunkSize) return trimmed;

  // System prompts are built per-call so user-configured overrides take effect.
  const mapSystemPrompt = buildSystemPrompt(PROMPTS.mapReduce.map, promptOverrides?.['mapReduce.map']);
  const reduceSystemPrompt = buildSystemPrompt(PROMPTS.mapReduce.reduce, promptOverrides?.['mapReduce.reduce']);

  const chunks = chunkText(trimmed, chunkSize, overlap);
  onProgress?.(formatUi(ui.backend.summarizeLong, { characters: trimmed.length, count: chunks.length }));

  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(formatUi(ui.backend.summarizeChunk, { current: i + 1, total: chunks.length }));
    const resp = await provider.complete(
      [
        { role: 'system', content: mapSystemPrompt },
        { role: 'user', content: buildMapUserPrompt(i + 1, chunks.length, chunks[i], instruction) },
      ],
      { signal }
    );
    summaries.push(resp.trim());
  }

  if (summaries.length === 1) return summaries[0];

  onProgress?.(ui.backend.mergeSummary);
  const combined = summaries.map((s, i) => `## Section ${i + 1}\n\n${s}`).join('\n\n');
  const resp = await provider.complete(
    [
      { role: 'system', content: reduceSystemPrompt },
      { role: 'user', content: buildReduceUserPrompt(combined, instruction) },
    ],
    { signal }
  );
  return resp.trim();
}
