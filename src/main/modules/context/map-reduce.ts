import type { AIProvider } from '../ai-providers/base.provider';
import { chunkText } from '../file-readers/base.reader';

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
}

const MAP_SYSTEM_PROMPT = `You are a technical document summarizer.
Summarize the given section of a technical document. Preserve:
- All key technical facts, specifications, numbers, units, and parameter values
- Important terminology, acronyms, and product/component names
- Code/API references and configuration details
- Relationships between concepts
Write a dense, factual summary (up to 400 words). Do not add commentary or opinions.`;

const REDUCE_SYSTEM_PROMPT = `You are merging section summaries of a technical document into a single coherent overview.
Combine the following section summaries into one dense technical summary (up to 800 words).
Preserve all key technical facts, specifications, numbers, terminology, and relationships.
Remove redundancy between sections. Do not add commentary or opinions.`;

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
  const { provider, chunkSize = 4000, overlap = 200, maxChunks = 20, signal, onProgress } = opts;
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= chunkSize) return trimmed;

  const chunks = selectChunks(chunkText(trimmed, chunkSize, overlap), maxChunks);
  onProgress?.(`文档较长（${trimmed.length} 字符），已分为 ${chunks.length} 段进行分段摘要...`);

  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`正在摘要第 ${i + 1}/${chunks.length} 段...`);
    const resp = await provider.complete(
      [
        { role: 'system', content: MAP_SYSTEM_PROMPT },
        { role: 'user', content: `Section ${i + 1}/${chunks.length}:\n\n${chunks[i]}` },
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
      { role: 'system', content: REDUCE_SYSTEM_PROMPT },
      { role: 'user', content: combined },
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