import { BaseAgent } from './base.agent';
import {
  DEFAULT_DOCUMENT_OUTLINE,
  buildWriterPrompt,
  buildWriterSystemPrompt,
} from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentOutline } from '../../../shared/types/document.types';
import type { AIToolDefinition } from '../ai-providers/base.provider';
import { v4 as uuidv4 } from 'uuid';
import { en as ui } from '../../../shared/i18n';

/** P4-8: on-demand glossary lookup exposed to the writer. */
const GLOSSARY_LOOKUP_TOOL: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'glossary_lookup',
    description:
      'Look up the approved en-US terminology in the project glossary. Call this when you are unsure which exact English wording to use for a concept in the source material. Returns matching entries (en-US / zh-CN / zh-TW).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Chinese or English concept to look up, e.g. 占空比 or duty ratio',
        },
        limit: { type: 'number', description: 'Maximum number of entries to return (default 5).' },
      },
      required: ['query'],
    },
  },
};

export class WriterAgent extends BaseAgent {
  get systemPrompt(): string {
    return buildWriterSystemPrompt(this.outline, this.config.promptOverride);
  }

  /** 文档大纲：优先使用配置，其次使用状态中的大纲，最后回退到默认 6 章节。 */
  private get outline(): DocumentOutline {
    return this.config.documentOutline ?? DEFAULT_DOCUMENT_OUTLINE;
  }

  /**
   * Single combined document: the user uploads multiple files as source
   * material for ONE aggregated document, so all analysis results are
   * synthesized into a single draft (previously M1 produced one draft per
   * file, which fragmented the output into multiple documents).
   * 章节结构由 DocumentOutline 参数化，不再固定模板。
   */
  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const analysisResults = state.analysisResults;
    const outline = state.documentOutline ?? this.outline;
    const now = new Date().toISOString();

    if (analysisResults.length === 0) {
      // Fallback: no analysis results — emit a single generic draft so the
      // pipeline can still proceed.
      const prompt = buildWriterPrompt(analysisResults, state.ingestContext || 'No analysis available.', outline, state.analysisSynthesisMarkdown, this.config.glossaryBlock);
      const content = await this.generate(prompt);
      return {
        drafts: [{
          id: uuidv4(),
          title: ui.docGenerator.fallbackDraftTitle,
          content,
          createdAt: now,
          updatedAt: now,
        }],
      };
    }

    const prompt = buildWriterPrompt(analysisResults, state.ingestContext, outline, state.analysisSynthesisMarkdown, this.config.glossaryBlock);
    const content = await this.generate(prompt);
    return {
      drafts: [{
        id: uuidv4(),
        title: ui.docGenerator.combinedDraftTitle,
        content,
        createdAt: now,
        updatedAt: now,
      }],
    };
  }

  /**
   * Generate the draft, optionally allowing the model to query the glossary
   * through a tool call (P4-8). Without a lookup callback (or without a
   * provider that supports function calling) this is a plain LLM call.
   */
  private async generate(prompt: string): Promise<string> {
    const lookup = this.config.glossaryLookup;
    if (!lookup) return this.callLLM(prompt);
    const content = await this.callLLMWithTools(
      prompt,
      [GLOSSARY_LOOKUP_TOOL],
      (name, args) => {
        if (name !== 'glossary_lookup') return JSON.stringify({ error: `unknown tool: ${name}` });
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        if (!query.trim()) return JSON.stringify({ entries: [] });
        return JSON.stringify({ entries: lookup(query, limit) });
      },
      { maxRounds: 2 }
    );
    return content.trim() ? content : this.callLLM(prompt);
  }
}
