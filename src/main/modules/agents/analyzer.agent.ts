import { BaseAgent } from './base.agent';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { AnalysisResult } from '../../../shared/types/document.types';

export class AnalyzerAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.config.systemPromptTemplate ?? `You are a senior technical writer for industrial automation documentation.
Analyze the provided documents and reference materials, then produce a JSON array of analysis results.
Each result must have:
- fileId: the file's id
- fileName: the file's name  
- summary: concise content summary
- keyPoints: key technical points (max 10)
- keywords: relevant keywords (max 15)
- technicalTerms: domain-specific terms found

Respond ONLY with valid JSON array, no markdown fences.`;
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const filesContext = state.inputFiles
      .filter((f) => f.parseStatus === 'done')
      .map((f) => `File: ${f.name}\nSummary: ${f.parseSummary ?? 'N/A'}\nText: ${(f.extractedText ?? '').slice(0, 2000)}`)
      .join('\n\n---\n\n');

    const refContext =
      state.referenceSearchResults.length > 0
        ? '\n\nReference documents found:\n' +
          state.referenceSearchResults
            .map((r) => `- ${r.fileName} (relevance: ${r.relevanceScore}%): ${r.snippet}`)
            .join('\n')
        : '';

    const prompt = `Analyze the following input documents:\n\n${filesContext}${refContext}\n\nProduce detailed analysis results for each input file.`;
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
