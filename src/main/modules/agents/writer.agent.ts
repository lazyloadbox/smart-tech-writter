import { BaseAgent } from './base.agent';
import type { DocGenState } from '../../../shared/types/workflow.types';
import { v4 as uuidv4 } from 'uuid';

export class WriterAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.config.systemPromptTemplate ?? `You are an expert technical writer specializing in industrial automation documentation.
Generate ONE well-structured technical document in Markdown format that synthesizes ALL the provided analysis results into a single coherent document.
The analysis results may come from multiple source files — merge related information across files into unified chapters instead of writing one document per file.
Produce clear, precise, professional content suitable for engineers and operators.
Use proper Markdown headings, bullet points, tables where appropriate.`;
  }

  /**
   * Single combined document: the user uploads multiple files as source
   * material for ONE aggregated document, so all analysis results are
   * synthesized into a single draft (previously M1 produced one draft per
   * file, which fragmented the output into multiple documents).
   */
  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const analysisResults = state.analysisResults;
    const now = new Date().toISOString();

    if (analysisResults.length === 0) {
      // Fallback: no analysis results — emit a single generic draft so the
      // pipeline can still proceed.
      const prompt = `Based on the following input, generate a comprehensive technical document:\n\n${state.ingestContext || 'No analysis available.'}\n\nProduce a well-structured Markdown document with:\n1. Executive Summary\n2. Product/Feature Overview\n3. Technical Specifications\n4. Key Features and Functions\n5. Requirements and Dependencies\n6. Implementation Notes\n\nUse appropriate Markdown formatting.`;
      const content = await this.callLLM(prompt);
      return {
        drafts: [{
          id: uuidv4(),
          title: '技术文档草稿',
          content,
          createdAt: now,
          updatedAt: now,
        }],
      };
    }

    // Combine every file's analysis into one context block so the AI can
    // cross-reference and merge them into a single document.
    const combinedContext = analysisResults
      .map((r) => `## Source File: ${r.fileName}\nSummary: ${r.summary}\nKey Points: ${r.keyPoints.join(', ')}\nKeywords: ${r.keywords.join(', ')}\nTechnical Terms: ${r.technicalTerms.join(', ')}`)
      .join('\n\n---\n\n');

    const prompt = `The following analysis results were extracted from ${analysisResults.length} source file(s). Synthesize ALL of them into ONE single comprehensive technical document. Integrate and cross-reference the content from every file — merge related information into unified chapters so the result reads as one coherent document covering the whole subject, not a separate section per file.\n\n${combinedContext}\n\nProduce a well-structured Markdown document with:\n1. Executive Summary\n2. Product/Feature Overview\n3. Technical Specifications\n4. Key Features and Functions\n5. Requirements and Dependencies\n6. Implementation Notes\n\nUse appropriate Markdown formatting.`;

    const content = await this.callLLM(prompt);
    return {
      drafts: [{
        id: uuidv4(),
        title: '综合技术文档',
        content,
        createdAt: now,
        updatedAt: now,
      }],
    };
  }
}
