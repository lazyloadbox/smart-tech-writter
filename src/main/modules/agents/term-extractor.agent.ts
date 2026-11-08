// L5a term extractor (design §2.5.7 / P2c-2).
//
// Primary path: `FileParserAgent` already returns structured `terms[]` from the
// upload/parse contract, so this agent costs zero extra calls for new projects.
// This class is the fallback for documents parsed before P2c (or when the
// parser returned no terms): it splits the text, extracts concepts with the
// fixed JSON contract, and caches results by chunk hash so a re-run costs
// nothing.

import crypto from 'node:crypto';
import { BaseAgent } from './base.agent';
import { PROMPTS, buildTermExtractorUserPrompt } from '../prompts';
import { chunkText } from '../file-readers/base.reader';
import { glossaryTermsContract } from '../ai-providers/output-contracts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { GlossaryTermCandidate } from '../../../shared/types/document.types';

/** Chunk results are cached in-process; re-runs of the same project are free. */
const CACHE_LIMIT = 64;

export interface TermExtractorOptions {
  chunkSize?: number;
  /** Parallel LLM calls (design: 3). */
  concurrency?: number;
  onProgress?: (message: string) => void;
}

export class TermExtractorAgent extends BaseAgent {
  private static readonly cache = new Map<string, GlossaryTermCandidate[]>();

  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.termExtractor);
  }

  /** Term extraction is a helper, not a workflow stage. */
  async execute(_state: DocGenState): Promise<Partial<DocGenState>> {
    return {};
  }

  /** Extract technical concepts from a document (chunked, cached, deduped). */
  async extractTerms(text: string, options: TermExtractorOptions = {}): Promise<GlossaryTermCandidate[]> {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return [];

    const chunkSize = options.chunkSize ?? 4000;
    const concurrency = Math.max(1, options.concurrency ?? 3);
    const chunks = chunkText(trimmed, chunkSize, 200);
    if (chunks.length === 0) return [];

    const results: GlossaryTermCandidate[][] = chunks.map((): GlossaryTermCandidate[] => []);
    const queue = chunks.map((chunk, index) => ({ index, hash: sha1(chunk) }));
    let completed = 0;

    const runWorker = async (): Promise<void> => {
      for (;;) {
        const task = queue.shift();
        if (!task) return;
        const cached = TermExtractorAgent.cache.get(task.hash);
        if (cached) {
          results[task.index] = cached;
        } else {
          try {
            const terms = await this.callStructuredLLM(
              buildTermExtractorUserPrompt(task.index + 1, chunks.length, chunks[task.index]),
              glossaryTermsContract,
              { signal: this.config.signal }
            );
            this.remember(task.hash, terms);
            results[task.index] = terms;
          } catch (err) {
            this.config.onProgress?.(
              `Glossary term extraction failed for section ${task.index + 1}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
        completed += 1;
        options.onProgress?.(`Extracted terms from section ${completed}/${chunks.length}`);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () => runWorker())
    );
    return mergeCandidates(results.flat());
  }

  /** Clear the in-process cache (tests / settings reset). */
  static clearCache(): void {
    TermExtractorAgent.cache.clear();
  }

  private remember(hash: string, terms: GlossaryTermCandidate[]): void {
    if (TermExtractorAgent.cache.size >= CACHE_LIMIT) {
      const oldest = TermExtractorAgent.cache.keys().next().value;
      if (oldest) TermExtractorAgent.cache.delete(oldest);
    }
    TermExtractorAgent.cache.set(hash, terms);
  }
}

function sha1(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

/**
 * Merge per-chunk candidates: identical surface + English guess collapse into
 * one, keeping the first non-empty context.
 */
export function mergeCandidates(terms: GlossaryTermCandidate[]): GlossaryTermCandidate[] {
  const seen = new Map<string, GlossaryTermCandidate>();
  for (const term of terms) {
    const surface = term.surface.trim();
    if (!surface) continue;
    const key = `${surface.toLowerCase()}|${(term.englishGuess ?? '').toLowerCase()}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.context && term.context) existing.context = term.context;
      continue;
    }
    seen.set(key, {
      surface,
      lang: term.lang,
      englishGuess: term.englishGuess?.trim() || undefined,
      context: term.context?.trim() || undefined,
    });
  }
  return [...seen.values()];
}
