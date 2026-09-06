import { BaseAgent } from './base.agent';
import { PROMPTS, buildAnalyzerUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { ExtractedItem } from '../../../shared/types/document.types';
import { analysisResultsContract } from '../ai-providers/output-contracts';
import { analysisResultToMarkdown } from '../../../shared/utils/artifact-markdown';

export class AnalyzerAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.analyzer);
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    // M7: the ingest stage already aggregated parsed files into
    // `ingestContext` is already a Markdown evidence bundle. Do not summarize
    // it again here: doing so turns the complete extraction back into a short
    // summary before the analytical pass can reason over it.
    let filesContextStr: string;
    if (state.ingestContext && state.ingestContext.length > 0) {
      filesContextStr = state.ingestContext;
    } else {
      const filesContext: string[] = [];
      for (const f of state.inputFiles.filter((f) => f.parseStatus === 'done')) {
        const markdown = f.parseMarkdown || f.parseExtraction?.markdown || f.extractedText || '';
        filesContext.push(`## File: ${f.name} [ID: ${f.id}]\n\n${markdown}`);
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
    const analysisBundle = await this.callStructuredLLM(prompt, analysisResultsContract);
    const analysisResults = analysisBundle.results;
    const knownFiles = new Map(state.inputFiles.filter((f) => f.parseStatus === 'done').map((f) => [f.id, f]));
    const resultIds = new Set(analysisResults.map((result) => result.fileId));
    if (
      resultIds.size !== knownFiles.size ||
      analysisResults.length !== knownFiles.size ||
      [...resultIds].some((id) => !knownFiles.has(id)) ||
      [...knownFiles.keys()].some((id) => !resultIds.has(id))
    ) {
      throw new Error(`AI analysis returned ${analysisResults.length} result(s) for ${knownFiles.size} input file(s). Every input file must have exactly one result.`);
    }
    return {
      analysisResults: analysisResults
        .map((result) => {
          const sourceItems = knownFiles.get(result.fileId)?.parseExtraction?.items ?? [];
          return {
            ...result,
            fileName: knownFiles.get(result.fileId)?.name ?? result.fileName,
            // Keep parser evidence first, then append genuinely new analysis
            // findings. This prevents a short analyzer response from replacing
            // the detailed extraction that downstream writing relies on.
            extractedItems: mergeExtractedItems(sourceItems, result.extractedItems ?? []),
            markdown: (() => {
              const complete = analysisResultToMarkdown(
                { ...result, fileName: knownFiles.get(result.fileId)?.name ?? result.fileName, extractedItems: mergeExtractedItems(sourceItems, result.extractedItems ?? []) },
                knownFiles.get(result.fileId)?.parseMarkdown || knownFiles.get(result.fileId)?.parseExtraction?.markdown,
              );
              return result.markdown?.trim()
                ? `${result.markdown.trim()}\n\n---\n\n${complete}`
                : complete;
            })(),
          };
        }),
      analysisSynthesisMarkdown: analysisBundle.synthesisMarkdown.trim(),
    };
  }
}

function mergeExtractedItems(sourceItems: ExtractedItem[], analysisItems: ExtractedItem[]): ExtractedItem[] {
  const merged: ExtractedItem[] = [];
  const seen = new Set<string>();
  for (const item of [...sourceItems, ...analysisItems]) {
    const key = [item.category, item.title, item.content, item.sourceQuote ?? '', item.sourceLocation ?? '']
      .map((part) => part.trim().toLocaleLowerCase())
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
