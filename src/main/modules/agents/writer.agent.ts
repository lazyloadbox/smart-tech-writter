import { BaseAgent } from './base.agent';
import {
  DEFAULT_DOCUMENT_OUTLINE,
  buildWriterPrompt,
  buildWriterSystemPrompt,
} from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentOutline } from '../../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';
import { en as ui } from '../../../shared/i18n';

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
      const prompt = buildWriterPrompt(analysisResults, state.ingestContext || 'No analysis available.', outline, state.analysisSynthesisMarkdown);
      const content = await this.callLLM(prompt);
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

    const prompt = buildWriterPrompt(analysisResults, state.ingestContext, outline, state.analysisSynthesisMarkdown);
    const content = await this.callLLM(prompt);
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
}
