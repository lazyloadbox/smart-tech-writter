import { BaseAgent } from './base.agent';
import type { AIProvider } from '../ai-providers/base.provider';
import type { AgentConfig } from './base.agent';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { ReviewComment, DocumentDraft } from '../../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';

export type ReviewMode = 'ai_review' | 'post_edit_review' | 'localize_ai_review' | 'dita_ai_review';

/**
 * Extract a JSON array string from an AI response that may be wrapped in
 * markdown code fences (```json ... ```) or surrounded by prose.
 * Strips leading/trailing fences and finds the outermost `[ ... ]` block.
 * Falls back to the trimmed original string if no array delimiters are found.
 */
function extractJsonArray(response: string): string {
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
 */
function normalizeComments(parsed: unknown, draftsToReview: DocumentDraft[]): ReviewComment[] | null {
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
      id: c.id ?? uuidv4(),
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

function tryParseComments(response: string, draftsToReview: DocumentDraft[]): ReviewComment[] | null {
  try {
    return normalizeComments(JSON.parse(extractJsonArray(response)), draftsToReview);
  } catch {
    return null;
  }
}

export class ReviewerAgent extends BaseAgent {
  private mode: ReviewMode;

  constructor(provider: AIProvider, config: AgentConfig & { mode?: ReviewMode } = {}) {
    super(provider, config);
    this.mode = config.mode ?? 'ai_review';
  }

  get systemPrompt(): string {
    if (this.config.systemPromptTemplate) return this.config.systemPromptTemplate;
    switch (this.mode) {
      case 'post_edit_review':
        return `You are a technical editor reviewing human-edited documentation.
Check for consistency, completeness, and technical accuracy after human edits.
Produce a JSON array of review comments. Each comment: { id, draftId, type, section, originalText, suggestedText, explanation }
Respond ONLY with valid JSON array.`;
      case 'localize_ai_review':
        return `You are a localization quality reviewer.
Check the localized document for translation accuracy, technical term consistency, and natural language flow.
Produce a JSON array of review comments. Each comment: { id, draftId, type, section, originalText, suggestedText, explanation }
Respond ONLY with valid JSON array.`;
      case 'dita_ai_review':
        return `You are a DITA XML technical reviewer.
Review the generated DITA 1.3 concept topic XML for: well-formedness, correct element nesting (concept/conbody/section/p/ul/ol/li/codeblock), valid escaping of special characters, appropriate section structure, and content fidelity to the source.
Produce a JSON array of review comments. Each comment: { id, draftId, type (suggestion|error|warning|info), section, originalText, suggestedText, explanation }
The originalText/suggestedText should quote the relevant XML fragment when proposing a fix.
Respond ONLY with valid JSON array, no markdown fences.`;
      default:
        return `You are a technical documentation quality reviewer.
Review the draft document for technical accuracy, clarity, completeness, and style consistency.
Produce a JSON array of review comments. Each comment must have: { id, draftId, type (suggestion|error|warning|info), section, originalText, suggestedText, explanation }
Respond ONLY with valid JSON array, no markdown fences.`;
    }
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const draftsToReview =
      this.mode === 'localize_ai_review' ? state.localizedDrafts :
      this.mode === 'dita_ai_review' ? state.ditaDocuments :
      state.drafts;
    if (draftsToReview.length === 0) return {};

    const draftsContext = draftsToReview.map((d) => `## ${d.title}\n\n${d.content}`).join('\n\n---\n\n');
    const humanEditsNote = this.mode === 'post_edit_review'
      ? (state.humanEditedDrafts?.[0]?.content ?? state.humanEdits)
        ? `\n\nHuman editor notes:\n${state.humanEditedDrafts?.[0]?.content ?? state.humanEdits}`
        : ''
      : '';

    const response = await this.callLLM(`Review the following document(s):\n\n${draftsContext}${humanEditsNote}`);

    // M6: parse with a one-shot retry. If the AI wrapped the JSON in fences /
    // prose (or emitted malformed JSON), ask it to output ONLY the corrected
    // array before degrading to a single info comment.
    let comments = tryParseComments(response, draftsToReview);
    if (!comments) {
      const fixPrompt = `Your previous response was not valid JSON. Output ONLY a corrected JSON array of review comments (same schema as requested). No markdown fences, no prose.\n\nPrevious response:\n${response}`;
      const retry = await this.callLLM(fixPrompt);
      comments = tryParseComments(retry, draftsToReview);
    }
    if (!comments) {
      comments = [{ id: uuidv4(), draftId: draftsToReview[0]?.id ?? '', type: 'info', explanation: response, accepted: false }];
    }

    switch (this.mode) {
      case 'post_edit_review': return { postEditReviewComments: comments };
      case 'localize_ai_review': return { localizeReviewComments: comments };
      case 'dita_ai_review': return { ditaReviewComments: comments };
      default: return { aiReviewComments: comments };
    }
  }
}