import { BaseAgent } from './base.agent';
import type { AIProvider } from '../ai-providers/base.provider';
import type { AgentConfig } from './base.agent';
import { PROMPTS, buildReviewFixPrompt, buildDitaReviewUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { ReviewComment, LocalizeLanguage } from '../../../shared/types/document.types';
import { extractJsonArray } from './reviewer.agent';
import { v4 as uuidv4 } from 'uuid';

export type DitaReviewMode = 'localize_ai_review' | 'post_edit_review';

const VALID_TYPES = new Set<ReviewComment['type']>(['suggestion', 'error', 'warning', 'info']);

/**
 * Parse an AI response into ReviewComment[] for a single DITA file.
 * All comments are pinned to the given `draftId` (the file's source path),
 * so the ReviewPanel can map them back to the right draft.
 */
function tryParseComments(response: string, draftId: string): ReviewComment[] | null {
  try {
    const parsed: unknown = JSON.parse(extractJsonArray(response));
    if (!Array.isArray(parsed)) return null;
    return parsed.map((c: Partial<ReviewComment>): ReviewComment => ({
      id: c.id ?? uuidv4(),
      draftId,
      type: VALID_TYPES.has(c.type as ReviewComment['type']) ? (c.type as ReviewComment['type']) : 'suggestion',
      section: c.section,
      originalText: c.originalText,
      suggestedText: c.suggestedText,
      explanation: c.explanation ?? '',
      accepted: false,
    }));
  } catch {
    return null;
  }
}

/**
 * Standalone DITA localization reviewer (independent feature).
 *
 * Reviews the translation quality of a localized DITA XML document against
 * its original, producing structured ReviewComment[] (same schema as the
 * document-generation ReviewerAgent). Two modes:
 * - `localize_ai_review`: first-pass review of the AI translation.
 * - `post_edit_review`: review after a human has edited the translation.
 *
 * Not part of the workflow graph — the abstract `execute()` is a no-op.
 */
export class DitaReviewerAgent extends BaseAgent {
  private mode: DitaReviewMode;

  constructor(provider: AIProvider, config: AgentConfig & { mode?: DitaReviewMode } = {}) {
    super(provider, config);
    this.mode = config.mode ?? 'localize_ai_review';
  }

  get systemPrompt(): string {
    switch (this.mode) {
      case 'post_edit_review':
        return this.buildSystemPrompt(PROMPTS.reviewer.postEditReview);
      default:
        return this.buildSystemPrompt(PROMPTS.reviewer.localizeAiReview);
    }
  }

  /** Not used by the workflow — satisfies the abstract BaseAgent contract. */
  async execute(_state: DocGenState): Promise<Partial<DocGenState>> {
    return {};
  }

  /**
   * Review a localized DITA XML document against its original.
   * Uses streaming (when a stream callback is set) with the empty-result
   * fallback built into BaseAgent.callLLM, plus a one-shot JSON fix retry.
   *
   * @param mappingContext optional glossary block (from MappingService) used
   *   to flag terminology that deviates from the established translations.
   */
  async review(
    localizedXml: string,
    originalXml: string,
    targetLanguage: LocalizeLanguage,
    draftId: string,
    mappingContext?: string
  ): Promise<ReviewComment[]> {
    const prompt = buildDitaReviewUserPrompt(originalXml, localizedXml, targetLanguage, this.mode, mappingContext);
    const response = await this.callLLM(prompt, { maxTokens: 128000 });

    let comments = tryParseComments(response, draftId);
    if (!comments) {
      const retry = await this.callLLM(buildReviewFixPrompt(response), { maxTokens: 128000 });
      comments = tryParseComments(retry, draftId);
    }
    if (!comments) {
      comments = [{ id: uuidv4(), draftId, type: 'info', explanation: response, accepted: false }];
    }
    return comments;
  }
}