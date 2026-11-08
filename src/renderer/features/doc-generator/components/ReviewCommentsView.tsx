import React, { useMemo } from 'react';
import type { ReviewComment } from '../../../../shared/types/document.types';
import { en as ui, formatUi } from '../../../../shared/i18n';
import { v4 as uuidv4 } from 'uuid';

interface ReviewCommentsViewProps {
  comments: ReviewComment[];
  /** Optional empty-state message. */
  emptyMessage?: string;
}

/**
 * Extract a JSON array string from a text blob that may be wrapped in
 * markdown code fences (```json ... ```) or surrounded by prose.
 * Mirrors the backend `extractJsonArray` helper.
 *
 * Exported so other components (e.g. ReviewPanel) can reuse the same
 * fallback-parsing logic when the backend stored the raw AI response as
 * a single info comment.
 */
export function extractJsonArray(text: string): string | null {
  let t = text.trim();
  // Strip markdown code fences
  const fenceMatch = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenceMatch) t = fenceMatch[1].trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return null;
}

/**
 * Normalize review comments for display.
 *
 * The AI reviewer is supposed to return a JSON array that the backend parses
 * into structured `ReviewComment[]`. However, when the backend JSON.parse
 * fails (e.g. the AI wrapped the JSON in markdown fences or added prose, or
 * embedded unescaped quotes inside string values), the backend stores the
 * ENTIRE raw response as a single `info` comment with the JSON string in
 * `explanation`. This helper detects that case and re-parses the embedded
 * JSON into proper structured comments so the UI can render visual cards
 * instead of a raw JSON markdown blob.
 *
 * Exported so ReviewPanel (and other consumers) can share the same logic.
 */
export function normalizeComments(comments: ReviewComment[]): ReviewComment[] {
  if (comments.length === 0) return comments;

  // Detect the fallback case: a single info comment whose explanation
  // contains a JSON array.
  if (comments.length === 1 && comments[0].type === 'info' && !comments[0].originalText) {
    const raw = comments[0].explanation;
    const jsonStr = extractJsonArray(raw);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          return parsed.map((c: Partial<ReviewComment>): ReviewComment => ({
            id: c.id ?? uuidv4(),
            draftId: c.draftId ?? '',
            type: c.type ?? 'suggestion',
            section: c.section,
            originalText: c.originalText,
            suggestedText: c.suggestedText,
            explanation: c.explanation ?? '',
            accepted: false,
          }));
        }
      } catch {
        // fall through — render as raw text below
      }
    }
  }

  return comments;
}

const TYPE_ICON: Record<string, string> = {
  error: '🔴',
  warning: '🟡',
  suggestion: '💡',
  info: 'ℹ️',
  'Technical Accuracy': '🔬',
  Consistency: '🔗',
  Completeness: '📋',
  Structure: '🏗️',
  Terminology: '📖',
  Grammar: '✍️',
  Style: '🎨',
  Clarity: '🔍',
};

const TYPE_LABEL: Record<string, string> = {
  ...ui.review.typeLabels,
  ...ui.review.categoryLabels,
};

export function typeIcon(type: string): string {
  return TYPE_ICON[type] ?? '💡';
}

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function typeColor(type: string): string {
  if (type === 'error' || type === 'Technical Accuracy') return 'text-red-400';
  if (type === 'warning' || type === 'Consistency') return 'text-yellow-400';
  if (type === 'suggestion' || type === 'Completeness') return 'text-blue-400';
  if (type === 'Structure') return 'text-purple-400';
  if (type === 'Terminology' || type === 'Grammar' || type === 'Style') return 'text-cyan-400';
  if (type === 'Clarity') return 'text-teal-400';
  return 'text-blue-400';
}

/**
 * Renders AI review comments as structured visual cards.
 *
 * Handles both:
 * - Properly structured `ReviewComment[]` (normal case)
 * - The fallback case where a single info comment contains the raw JSON
 *   string in its `explanation` (re-parsed into structured cards here)
 *
 * Each card shows: type icon + label, section, explanation, and an
 * originalText → suggestedText diff (strikethrough red / green).
 */
export const ReviewCommentsView: React.FC<ReviewCommentsViewProps> = ({ comments, emptyMessage = ui.review.emptyComments }) => {
  const normalized = useMemo(() => normalizeComments(comments), [comments]);

  if (normalized.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-4">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {normalized.map((c) => (
        <div key={c.id} className="p-2.5 bg-gray-800 rounded border border-gray-700">
          <div className="flex items-start gap-2">
            <span className={`shrink-0 text-xs mt-0.5 ${typeColor(c.type)}`}>
              {typeIcon(c.type)}
            </span>
            <div className="flex-1 min-w-0">
              {/* Header: type + section + accepted badge */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-medium ${typeColor(c.type)}`}>
                  {typeLabel(c.type)}
                </span>
                {(c.origin === 'glossary' || c.section === 'Glossary') && (
                  <span className="px-1 py-0.5 rounded bg-green-900/50 text-green-300 border border-green-800/50 text-[9px]">
                    📚 {ui.review.glossaryBadge}
                  </span>
                )}
                {c.section && (
                  <span className="text-xs text-gray-500 truncate">{formatUi(ui.review.section, { section: c.section ?? '' })}</span>
                )}
                {c.accepted && <span className="text-xs text-green-400 ml-auto">✓ {ui.common.accepted}</span>}
              </div>

              {/* Explanation */}
              <p className="text-xs text-gray-300 mb-1.5 leading-relaxed">{c.explanation}</p>

              {/* Original → Suggested diff */}
              {c.originalText && c.suggestedText && (
                <div className="space-y-0.5 text-[11px]">
                  {c.originalText !== c.suggestedText && (
                    <div className="text-red-400/70 line-through bg-red-900/10 px-1.5 py-0.5 rounded whitespace-pre-wrap break-words">
                      <span className="text-red-500/80 font-medium">{ui.review.originalText}</span>
                      {c.originalText}
                    </div>
                  )}
                  <div className="text-green-400/80 bg-green-900/10 px-1.5 py-0.5 rounded whitespace-pre-wrap break-words">
                    <span className="text-green-500/80 font-medium">{ui.review.suggestedText}</span>
                    {c.suggestedText}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
