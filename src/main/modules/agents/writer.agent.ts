import { BaseAgent } from './base.agent';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentDraft } from '../../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';

export class WriterAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.config.systemPromptTemplate ?? `You are an expert technical writer specializing in industrial automation documentation.
Generate well-structured technical documentation in Markdown format based on the analysis results provided.
Produce clear, precise, professional content suitable for engineers and operators.
Use proper Markdown headings, bullet points, tables where appropriate.`;
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const analysisContext = state.analysisResults
      .map(
        (r) =>
          `File: ${r.fileName}\nSummary: ${r.summary}\nKey Points: ${r.keyPoints.join(', ')}\nKeywords: ${r.keywords.join(', ')}`
      )
      .join('\n\n---\n\n');

    const prompt = `Based on the following analysis results, generate a comprehensive technical document:\n\n${analysisContext}\n\nProduce a well-structured Markdown document with:\n1. Executive Summary\n2. Product/Feature Overview\n3. Technical Specifications\n4. Key Features and Functions\n5. Requirements and Dependencies\n6. Implementation Notes\n\nUse appropriate Markdown formatting.`;

    const content = await this.callLLM(prompt);
    const now = new Date().toISOString();
    const draft: DocumentDraft = {
      id: uuidv4(),
      title: '技术文档草稿',
      content,
      createdAt: now,
      updatedAt: now,
    };
    return { drafts: [draft] };
  }
}
