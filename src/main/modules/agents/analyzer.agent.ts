import { BaseAgent } from './base.agent';
import { summarizeLongText } from '../context';
import { PROMPTS, buildAnalyzerUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { AnalysisResult } from '../../../shared/types/document.types';

export class AnalyzerAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.analyzer);
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    // M7: the ingest stage already aggregated parsed files into
    // `ingestContext` (metadata + AI summary + extracted text). Use it when
    // available so we don't re-read/re-summarize files; fall back to the old
    // per-file map-reduce path for states persisted before ingest produced it.
    // Either way, long contexts still go through map-reduce (R2) so token
    // limits are respected.
    let filesContextStr: string;
    if (state.ingestContext && state.ingestContext.length > 0) {
      filesContextStr = await summarizeLongText(state.ingestContext, {
        provider: this.provider,
        signal: this.config.signal,
        onProgress: (msg) => this.config.onProgress?.(msg),
        promptOverrides: this.config.promptOverrides,
      });
    } else {
      const filesContext: string[] = [];
      for (const f of state.inputFiles.filter((f) => f.parseStatus === 'done')) {
        const text = await summarizeLongText(f.extractedText ?? '', {
          provider: this.provider,
          signal: this.config.signal,
          onProgress: (msg) => this.config.onProgress?.(msg),
          promptOverrides: this.config.promptOverrides,
        });
        filesContext.push(`File: ${f.name}\nSummary: ${f.parseSummary ?? 'N/A'}\nText: ${text}`);
      }
      filesContextStr = filesContext.join('\n\n---\n\n');
    }

    const refContext =
      state.referenceSearchResults.length > 0
        ? '\n\nReference documents found:\n' +
          state.referenceSearchResults
            .map((r) => `- ${r.fileName} (relevance: ${r.relevanceScore}%): ${r.snippet}`)
            .join('\n')
        : '';

    const prompt = buildAnalyzerUserPrompt(filesContextStr, refContext);
    const response = await this.callLLM(prompt);
    let analysisResults: AnalysisResult[];
    try {
      analysisResults = JSON.parse(response);
    } catch {
      analysisResults = state.inputFiles
        .filter((f) => f.parseStatus === 'done')
        .map((f) => ({
          fileId: f.id,
          fileName: f.name,
          summary: response,
          keyPoints: [] as string[],
          keywords: [] as string[],
          technicalTerms: [] as string[],
        }));
    }
    return { analysisResults };
  }
}
