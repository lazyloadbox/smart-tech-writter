import type { AIProvider } from '../ai-providers/base.provider';
import { chunkText } from '../file-readers/base.reader';
import { PROMPTS, buildSystemPrompt, buildMapUserPrompt, buildReduceUserPrompt } from '../prompts';
import type { PromptOverrides } from '../prompts';

export interface SummarizeOptions {
  provider: AIProvider;
  /** Max characters per chunk before map-reduce kicks in. */
  chunkSize?: number;
  /** Overlap between consecutive chunks. */
  overlap?: number;
  /** Safety cap on the number of chunks summarized (evenly sampled). */
  maxChunks?: number;
  /** AbortSignal to cancel in-flight summarization calls (pause / go-back). */
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /** 提示词覆盖：map / reduce 的 system prompt 可被用户配置覆盖。 */
  promptOverrides?: PromptOverrides;
  /** 用户解析提示词：注入 map / reduce 的 user prompt，指导摘要重点与分析设计。 */
  instruction?: string;
}

/**
 * Map-reduce summarization for long documents (fixes R2).
 *
 * Short texts (<= chunkSize) are returned unchanged. Longer texts are split
 * into overlapping chunks, each chunk is summarized (map), and the per-chunk
 * summaries are merged into one overview (reduce). If the chunk count exceeds
 * maxChunks, chunks are sampled evenly across the whole document so both the
 * head and tail stay covered instead of a hard head-only truncation.
 */
export async function summarizeLongText(text: string, opts: SummarizeOptions): Promise<string> {
  const { provider, chunkSize = 4000, overlap = 200, maxChunks = 20, signal, onProgress, promptOverrides, instruction } = opts;
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= chunkSize) return trimmed;

  // System prompts are built per-call so user-configured overrides take effect.
  const mapSystemPrompt = buildSystemPrompt(PROMPTS.mapReduce.map, promptOverrides?.['mapReduce.map']);
  const reduceSystemPrompt = buildSystemPrompt(PROMPTS.mapReduce.reduce, promptOverrides?.['mapReduce.reduce']);

  const chunks = selectChunks(chunkText(trimmed, chunkSize, overlap), maxChunks);
  onProgress?.(`文档较长（${trimmed.length} 字符），已分为 ${chunks.length} 段进行分段摘要...`);

  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`正在摘要第 ${i + 1}/${chunks.length} 段...`);
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

  onProgress?.('正在合并各段摘要...');
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

function selectChunks(chunks: string[], maxChunks: number): string[] {
  if (chunks.length <= maxChunks) return chunks;
  const step = (chunks.length - 1) / (maxChunks - 1);
  const selected: string[] = [];
  for (let i = 0; i < maxChunks; i++) {
    selected.push(chunks[Math.round(i * step)]);
  }
  return selected;
}