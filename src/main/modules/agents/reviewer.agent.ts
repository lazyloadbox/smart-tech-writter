import { BaseAgent } from './base.agent';
import type { AIProvider } from '../ai-providers/base.provider';
import type { AgentConfig } from './base.agent';
import { PROMPTS, buildReviewUserPrompt } from '../prompts';
import { reviewCommentsContract } from '../ai-providers/output-contracts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { ReviewComment, DocumentDraft } from '../../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';

export type ReviewMode = 'ai_review' | 'post_edit_review' | 'localize_ai_review' | 'dita_ai_review';

/**
 * Extract a JSON array string from an AI response that may be wrapped in
 * markdown code fences (```json ... ```) or surrounded by prose.
 * Strips leading/trailing fences and finds the outermost `[ ... ]` block.
 * Falls back to the trimmed original string if no array delimiters are found.
 *
 * Exported so the standalone DITA reviewer can reuse the same parsing.
 */
export function extractJsonArray(response: string): string {
  let text = response.trim();

  // Strip markdown code fences: ```json\n...\n``` or ```\n...\n```
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Find the outermost JSON array [ ... ]
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

const VALID_TYPES = new Set<ReviewComment['type']>(['suggestion', 'error', 'warning', 'info']);

/**
 * Normalize a parsed AI response into ReviewComment[].
 * - Coerces each item's type to the known set.
 * - Resolves bogus/placeholder `draftId`s (M6): if the AI returns a draftId
 *   that doesn't match any known draft, remap it to the draft whose content
 *   contains `originalText`, else fall back by index. This moves the
 *   "wrong draftId" workaround from the frontend into the backend where it
 *   can be done deterministically.
 * Returns null when the payload isn't a JSON array.
 *
 * Exported so the standalone DITA reviewer can reuse the same normalization.
 */
export function normalizeComments(parsed: unknown, draftsToReview: DocumentDraft[]): ReviewComment[] | null {
  if (!Array.isArray(parsed)) return null;
  const knownIds = new Set(draftsToReview.map((d) => d.id));
  return parsed.map((c: Partial<ReviewComment>, idx: number): ReviewComment => {
    let draftId = c.draftId ?? draftsToReview[0]?.id ?? '';
    if (!knownIds.has(draftId)) {
      const byContent = c.originalText
        ? draftsToReview.find((d) => d.content.includes(c.originalText))
        : undefined;
      draftId = byContent?.id
        ?? draftsToReview[Math.min(idx, draftsToReview.length - 1)]?.id
        ?? draftsToReview[0]?.id
        ?? '';
    }
    return {
      id: c.id || uuidv4(),
      draftId,
      type: VALID_TYPES.has(c.type as ReviewComment['type']) ? (c.type as ReviewComment['type']) : 'suggestion',
      section: c.section,
      originalText: c.originalText,
      suggestedText: c.suggestedText,
      explanation: c.explanation ?? '',
      accepted: false,
    };
  });
}

export class ReviewerAgent extends BaseAgent {
  private mode: ReviewMode;

  constructor(provider: AIProvider, config: AgentConfig & { mode?: ReviewMode } = {}) {
    super(provider, config);
    this.mode = config.mode ?? 'ai_review';
  }

  get systemPrompt(): string {
    switch (this.mode) {
      case 'post_edit_review':
        return this.buildSystemPrompt(PROMPTS.reviewer.postEditReview);
      case 'localize_ai_review':
        return this.buildSystemPrompt(PROMPTS.reviewer.localizeAiReview);
      case 'dita_ai_review':
        return this.buildSystemPrompt(PROMPTS.reviewer.ditaAiReview);
      default:
        return this.buildSystemPrompt(PROMPTS.reviewer.aiReview);
    }
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const draftsToReview =
      this.mode === 'localize_ai_review' ? state.localizedDrafts :
      this.mode === 'dita_ai_review' ? state.ditaDocuments :
      state.drafts;
    if (draftsToReview.length === 0) return {};

    const humanEditsNote = this.mode === 'post_edit_review'
      ? (state.humanEditedDrafts?.[0]?.content ?? state.humanEdits)
        ? `\n\nHuman editor notes:\n${state.humanEditedDrafts?.[0]?.content ?? state.humanEdits}`
        : ''
      : '';

    const threshold = this.config.chunkThresholdChars ?? 0;
    const totalChars = draftsToReview.reduce((sum, d) => sum + d.content.length, 0);
    let aiComments: ReviewComment[];
    if (threshold > 0 && totalChars > threshold) {
      aiComments = await this.executeChunked(draftsToReview, humanEditsNote, threshold);
    } else {
      const draftsContext = draftsToReview.map((d) => `## ${d.title} [ID: ${d.id}]\n\n${d.content}`).join('\n\n---\n\n');
      const parsed = await this.callStructuredLLM(
        buildReviewUserPrompt(draftsContext, humanEditsNote, this.config.glossaryBlock),
        reviewCommentsContract
      );
      aiComments = normalizeComments(parsed, draftsToReview) ?? [];
    }

    const comments = mergeRuleComments(aiComments, this.config.ruleComments ?? []);

    switch (this.mode) {
      case 'post_edit_review': return { postEditReviewComments: comments };
      case 'localize_ai_review': return { localizeReviewComments: comments };
      case 'dita_ai_review': return { ditaReviewComments: comments };
      default: return { aiReviewComments: comments };
    }
  }

  /**
   * Review large documents section by section (design §2.8.2a).
   * Each chunk carries the same glossary block; only the rule violations that
   * occur inside the chunk are injected, so the AI focuses on locating and
   * fixing rather than re-discovering. Comments are de-duplicated afterwards.
   */
  private async executeChunked(
    drafts: DocumentDraft[],
    humanEditsNote: string,
    threshold: number
  ): Promise<ReviewComment[]> {
    const merged: ReviewComment[] = [];
    for (const draft of drafts) {
      const chunks = splitChunks(draft.content, threshold);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const relevantRules = (this.config.ruleComments ?? []).filter((c) => {
          // R1 warnings cannot be located to an exact snippet — include them in
          // the first chunk only so they are reported exactly once.
          if (!c.originalText) return i === 0;
          return chunk.includes(c.originalText);
        });
        const ruleNote = relevantRules.length > 0
          ? `\n\nRule-layer findings that must be located and fixed in this section:\n${relevantRules
              .map((c) => `- ${c.originalText ? `\\"${c.originalText}\\" → ` : ''}${c.suggestedText ?? ''} (${c.explanation})`)
              .join('\n')}`
          : '';
        const context = `## ${draft.title} (section ${i + 1}/${chunks.length}) [ID: ${draft.id}]\n\n${chunk}${ruleNote}`;
        const parsed = await this.callStructuredLLM(
          buildReviewUserPrompt(context, humanEditsNote, this.config.glossaryBlock),
          reviewCommentsContract
        );
        const comments = normalizeComments(parsed, drafts) ?? [];
        merged.push(...comments);
      }
    }
    return dedupeComments(merged);
  }
}

/** Split a draft at heading boundaries into chunks of at most `maxChars`. */
function splitChunks(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) return [content];
  const lines = content.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of lines) {
    const isHeading = /^#{1,3}\s+/.test(line);
    if (isHeading && current.length > 0 && size >= maxChars * 0.6) {
      chunks.push(current.join('\n'));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks.length > 0 ? chunks : [content];
}

/** De-duplicate AI comments by (originalText, suggestedText). */
function dedupeComments(comments: ReviewComment[]): ReviewComment[] {
  const seen = new Set<string>();
  const out: ReviewComment[] = [];
  for (const comment of comments) {
    const key = `${comment.originalText ?? ''}|${comment.suggestedText ?? ''}|${comment.explanation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(comment);
  }
  return out;
}

/**
 * Merge deterministic rule comments with AI comments (design §2.8.4).
 * A rule comment is dropped when the AI already produced a Glossary comment
 * whose suggested text contains the rule's expected wording (the AI fix is
 * more specific), avoiding duplicate cards in the review panel.
 */
export function mergeRuleComments(
  aiComments: ReviewComment[],
  ruleComments: ReviewComment[]
): ReviewComment[] {
  if (ruleComments.length === 0) return aiComments;
  const aiGlossaryFixes = aiComments.filter((c) => c.section === 'Glossary' && c.suggestedText);
  const remaining = ruleComments.filter((rule) => {
    if (!rule.suggestedText) return true;
    return !aiGlossaryFixes.some((ai) => ai.suggestedText && ai.suggestedText.includes(rule.suggestedText as string));
  });
  return [...aiComments, ...remaining];
}
