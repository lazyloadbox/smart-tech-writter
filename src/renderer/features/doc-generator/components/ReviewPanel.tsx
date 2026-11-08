import React, { useState, useCallback, useMemo } from 'react';
import type { DocumentDraft, ReviewComment } from '../../../../shared/types/document.types';
import { en as ui, formatUi } from '../../../../shared/i18n';
import { normalizeComments, typeIcon, typeLabel, typeColor } from './ReviewCommentsView';
import { HighlightedTextarea } from './xml/HighlightedTextarea';
import { XmlHighlight } from './xml/XmlHighlight';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AiArtifactChat } from './AiArtifactChat';

interface ReviewPanelProps {
  drafts: DocumentDraft[];
  comments: ReviewComment[];
  /**
   * Called with the FULL edited drafts array (multi-draft support, M1) — the
   * active doc's effective content is applied to its slot, other docs are
   * passed through unchanged.
   */
  onSubmit: (editedDrafts: DocumentDraft[], acceptedIds: string[]) => void;
  title?: string;
  submitLabel?: string;
  /** Optional content rendered on the left side of the footer (e.g. language selector). */
  footerLeft?: React.ReactNode;
  /**
   * Editor flavor: `markdown` (default, plain textarea) or `xml` (textarea
   * with live XML syntax highlighting, used for DITA review).
   */
  editorMode?: 'markdown' | 'xml';
  /**
   * Left panel content:
   * - `comments` (default): AI review comments with accept/reject.
   * - `original`: the original source drafts (read-only), synced to the
   *   active doc tab — used for side-by-side review before AI comments exist.
   */
  leftPanel?: 'comments' | 'original';
  /** Original source drafts shown when `leftPanel === 'original'` (falls back to `drafts`). */
  originalDrafts?: DocumentDraft[];
  /** Optional AI conversation for refining the active artifact before submit. */
  onAiEdit?: (currentContent: string, instruction: string) => Promise<string>;
  /** Label shown in the AI conversation header. */
  aiArtifactLabel?: string;
}

/**
 * ReviewPanel with smart accept/reject logic:
 * - Accepting a comment auto-applies suggestedText → originalText in the editor
 * - Rejecting a previously accepted comment reverts the change
 * - Manual inline editing is always supported
 *
 * Design notes (fixes "accepting a suggestion doesn't update the draft"):
 * - `manualEdits` is ONLY written when the user types in the textarea.
 *   Accept/reject never touches `manualEdits`. Previously, toggleAccept
 *   synced manualEdits with a stale ref, which froze the pre-accept
 *   content as the base and made the right-side editor appear unchanged.
 * - `effectiveContent` is a pure derived value:
 *     base = manualEdits[doc] ?? drafts[doc].content
 *     effectiveContent = applyAcceptedSuggestions(base)
 *   So toggling accept instantly recomputes and re-renders the editor.
 * - `replaceFirst` uses three matching strategies (exact → CRLF-normalized
 *   with correct index mapping → whitespace-collapsed fuzzy) because the
 *   AI's `originalText` often differs from the draft by line endings or
 *   incidental whitespace, causing silent match failures.
 */
export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  drafts, comments, onSubmit, title = ui.review.defaultTitle, submitLabel = ui.review.defaultSubmit, footerLeft, editorMode = 'markdown',
  leftPanel = 'comments', originalDrafts,
  onAiEdit, aiArtifactLabel,
}) => {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [activeDoc, setActiveDoc] = useState(0);
  const [onlyGlossary, setOnlyGlossary] = useState(false);
  // Track manual edits separately from auto-applied changes.
  // Only updated when the user types in the textarea — NEVER on accept/reject.
  const [manualEdits, setManualEdits] = useState<Record<number, string>>({});

  // Normalize comments: when the backend JSON.parse failed, it stores the
  // raw AI response (which contains a JSON array) as a single info comment.
  // Re-parse it here so we render structured cards + enable accept-to-edit.
  // This mirrors ReviewCommentsView's behavior and fixes Stage 7c showing
  // raw JSON text instead of visual review cards.
  const normalizedComments = useMemo(() => normalizeComments(comments), [comments]);
  const displayComments = useMemo(
    () =>
      onlyGlossary
        ? normalizedComments.filter((comment) => comment.origin === 'glossary' || comment.section === 'Glossary')
        : normalizedComments,
    [normalizedComments, onlyGlossary]
  );
  const isGlossaryComment = (comment: ReviewComment) =>
    comment.origin === 'glossary' || comment.section === 'Glossary';
  const glossaryCommentCount = normalizedComments.filter(isGlossaryComment).length;

  // Helper: normalize line endings to LF for robust matching
  const toLF = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  /**
   * Replace the first occurrence of `search` with `repl` in `text`.
   * Returns `{ text, matched }` so callers can report match failures.
   * Strategy:
   *  1) Exact substring match (fast path).
   *  2) CRLF-normalized match — but map the normalized index back to the
   *     ORIGINAL text so we slice the real string (the old code sliced the
   *     original at a normalized index, which is wrong when \r\n vs \n
   *     lengths differ).
   *  3) Whitespace-collapsed fuzzy match — collapses runs of whitespace to
   *     a single space and compares case-insensitively, then maps the
   *     collapsed index back to the original text. This catches the common
   *     case where the AI's originalText has slightly different spacing or
   *     line breaks than the draft.
   */
  const replaceFirst = (text: string, search: string, repl: string): { text: string; matched: boolean } => {
    if (!search) return { text, matched: false };

    // 1) Exact match (fast path)
    const exactIdx = text.indexOf(search);
    if (exactIdx >= 0) {
      return {
        text: text.substring(0, exactIdx) + repl + text.substring(exactIdx + search.length),
        matched: true,
      };
    }

    // 2) Line-ending-normalized match with correct index mapping.
    //    Walk both strings in parallel, tracking the original-text offset
    //    that corresponds to the normalized match start.
    const normText = toLF(text);
    const normSearch = toLF(search);
    const normIdx = normText.indexOf(normSearch);
    if (normIdx >= 0) {
      // Map normIdx (in normText) back to an offset in the original `text`.
      // normText is `text` with each \r\n (2 chars) → \n (1 char) and lone \r → \n.
      // We scan the original text and count normalized characters consumed.
      let origPos = 0;
      let normPos = 0;
      while (normPos < normIdx && origPos < text.length) {
        if (text[origPos] === '\r' && text[origPos + 1] === '\n') {
          // \r\n → single \n in normalized
          origPos += 2;
          normPos += 1;
        } else if (text[origPos] === '\r') {
          origPos += 1;
          normPos += 1;
        } else {
          origPos += 1;
          normPos += 1;
        }
      }
      const startInOrig = origPos;
      // Now find the end: consume normSearch.length normalized chars from startInOrig
      let endOrig = startInOrig;
      let consumedNorm = 0;
      while (consumedNorm < normSearch.length && endOrig < text.length) {
        if (text[endOrig] === '\r' && text[endOrig + 1] === '\n') {
          endOrig += 2;
          consumedNorm += 1;
        } else if (text[endOrig] === '\r') {
          endOrig += 1;
          consumedNorm += 1;
        } else {
          endOrig += 1;
          consumedNorm += 1;
        }
      }
      return {
        text: text.substring(0, startInOrig) + repl + text.substring(endOrig),
        matched: true,
      };
    }

    // 3) Whitespace-collapsed fuzzy match (case-insensitive).
    //    Collapses all whitespace runs to a single space. Maps the collapsed
    //    index back to the original text by scanning and counting non-ws
    //    tokens + single inter-token spaces.
    const collapse = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const collText = collapse(text);
    const collSearch = collapse(search);
    const collIdx = collText.indexOf(collSearch);
    if (collIdx >= 0 && collSearch.length > 0) {
      // Map collIdx back to original text. Build a mapping from collapsed
      // positions to original offsets by scanning the original once.
      const origOffsets: number[] = []; // origOffsets[collPos] = start in original
      let oPos = 0;
      let cPos = 0;
      // Skip leading whitespace in original to align with trimmed collapsed text
      while (oPos < text.length && /\s/.test(text[oPos])) oPos++;
      while (oPos < text.length && cPos <= collIdx + collSearch.length) {
        origOffsets[cPos] = oPos;
        // Emit one collapsed char (the non-ws char), then skip following ws
        oPos++;
        // Skip subsequent whitespace, which collapses to a single space in collText
        if (oPos < text.length && /\s/.test(text[oPos])) {
          // The collapsed string has a single space here (if more non-ws follows)
          // Only count the space if there's more non-ws content after.
          let lookAhead = oPos;
          while (lookAhead < text.length && /\s/.test(text[lookAhead])) lookAhead++;
          if (lookAhead < text.length) {
            cPos++; // the space
            origOffsets[cPos] = oPos; // space maps to first ws offset (approx)
          }
          oPos = lookAhead;
        }
        cPos++;
      }
      const startOrig = origOffsets[collIdx] ?? 0;
      const endColl = collIdx + collSearch.length;
      // Find end in original: walk from startOrig consuming collapsed chars
      let endOrig = startOrig;
      let walk = collIdx;
      while (walk < endColl && endOrig < text.length) {
        // consume one non-ws char
        if (origOffsets[walk] !== undefined) endOrig = origOffsets[walk];
        walk++;
      }
      // Advance endOrig to cover the last collapsed char's actual length
      // (origOffsets[walk-1] is the start of the last token; consume that token)
      if (endOrig < text.length && !/\s/.test(text[endOrig])) {
        while (endOrig < text.length && !/\s/.test(text[endOrig])) endOrig++;
      }
      return {
        text: text.substring(0, startOrig) + repl + text.substring(endOrig),
        matched: true,
      };
    }

    return { text, matched: false };
  };

  // Compute the effective content: base content + applied accepted suggestions.
  // Also track which accepted comments failed to match so we can show feedback.
  const { effectiveContent, failedAcceptIds } = useMemo(() => {
    const baseContent = manualEdits[activeDoc] ?? drafts[activeDoc]?.content ?? '';
    let result = baseContent;
    const activeDraftId = drafts[activeDoc]?.id;
    // Set of all known draft ids — used to detect when a comment's draftId
    // is bogus/placeholder (doesn't match any real draft). In that case we
    // still apply it to the active doc, otherwise the AI returning a wrong
    // draftId (common with localize comments) would silently drop the edit.
    const knownDraftIds = new Set(drafts.map((d) => d.id));
    const failed: string[] = [];
    // Sort by originalText length descending so longer (more specific) snippets
    // are replaced first, reducing the chance of partial-overlap conflicts.
    const sortedAccepted = normalizedComments
      .filter((c) => {
        if (!accepted.has(c.id) || !c.originalText || !c.suggestedText) return false;
        // Apply if the comment targets the active draft, OR if its draftId
        // doesn't match any known draft (treat as active-doc comment).
        if (c.draftId === activeDraftId) return true;
        if (!c.draftId || !knownDraftIds.has(c.draftId)) return true;
        return false;
      })
      .sort((a, b) => (b.originalText?.length ?? 0) - (a.originalText?.length ?? 0));

    for (const c of sortedAccepted) {
      if (c.originalText && c.suggestedText) {
        const { text: next, matched } = replaceFirst(result, c.originalText, c.suggestedText);
        if (matched) {
          result = next;
        } else {
          failed.push(c.id);
        }
      }
    }
    return { effectiveContent: result, failedAcceptIds: failed };
  }, [drafts, activeDoc, accepted, normalizedComments, manualEdits]);

  const toggleAccept = useCallback((comment: ReviewComment) => {
    // Only toggle membership in the accepted set. Do NOT touch manualEdits —
    // effectiveContent is a pure derived value and will recompute immediately.
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(comment.id)) {
        next.delete(comment.id);
      } else {
        next.add(comment.id);
      }
      return next;
    });
  }, []);

  const acceptAll = useCallback(() => {
    // Only accept comments that have suggestedText (actionable suggestions).
    // effectiveContent recomputes from the (unchanged) base + all accepted.
    const actionable = normalizedComments.filter((c) => c.suggestedText);
    setAccepted(new Set(actionable.map((c) => c.id)));
  }, [normalizedComments]);

  const handleManualEdit = useCallback((value: string) => {
    // User typed in the textarea — record as the new base for this doc.
    setManualEdits((prev) => ({ ...prev, [activeDoc]: value }));
  }, [activeDoc]);

  // Get status of a comment for display
  const getCommentStatus = (comment: ReviewComment): 'accepted' | 'rejected' | 'pending' => {
    if (accepted.has(comment.id)) return 'accepted';
    return 'pending';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Left: AI Comments (or Original source when leftPanel === 'original') */}
        <div className={`${leftPanel === 'original' ? 'flex-1 min-w-0' : 'w-80 shrink-0'} border-r border-gray-700 flex flex-col overflow-hidden`}>
          <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">
              {leftPanel === 'original' ? `📄 ${ui.review.sourceReadOnly}` : formatUi(ui.review.aiSuggestions, { count: normalizedComments.length })}
              {leftPanel !== 'original' && accepted.size > 0 && (
                <span className="ml-1 text-green-400">{formatUi(ui.review.acceptedCount, { count: accepted.size })}</span>
              )}
            </span>
            {leftPanel !== 'original' && normalizedComments.filter((c) => c.suggestedText).length > 0 && (
              <button onClick={acceptAll} className="text-xs text-blue-400 hover:text-blue-300">
                {ui.review.acceptAll}
              </button>
            )}
          </div>
          {leftPanel !== 'original' && glossaryCommentCount > 0 && (
            <div className="px-3 py-1.5 bg-gray-900/50 border-b border-gray-700">
              <button
                onClick={() => setOnlyGlossary((prev) => !prev)}
                className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  onlyGlossary
                    ? 'bg-green-900/60 text-green-300 border-green-700'
                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-gray-200'
                }`}
              >
                📚 {formatUi(ui.review.onlyGlossaryCount, { count: glossaryCommentCount })}
              </button>
            </div>
          )}
          {/* Doc tabs for multi-doc */}
          {drafts.length > 1 && (
            <div className="flex border-b border-gray-700 px-2 bg-gray-800">
              {drafts.map((d, i) => (
                <button key={d.id} onClick={() => setActiveDoc(i)}
                  className={`px-2 py-1 text-xs border-b-2 ${i === activeDoc ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-500'}`}>
                  {d.title}
                </button>
              ))}
            </div>
          )}
          {leftPanel === 'original' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {(originalDrafts ?? drafts).length === 0 && (
                <p className="text-xs text-gray-500 p-4 text-center">{ui.review.noSource}</p>
              )}
              {(originalDrafts ?? drafts).map((d, i) => (
                <div key={d.id} className={i === activeDoc ? '' : 'hidden'}>
                  <h3 className="text-sm font-medium text-gray-200 mb-2">{d.title}</h3>
                  {editorMode === 'xml' ? (
                    <XmlHighlight code={d.content} />
                  ) : (
                    <MarkdownRenderer content={d.content} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {displayComments.length === 0 && (
                <p className="text-xs text-gray-500 p-4 text-center">{ui.review.noSuggestions}</p>
              )}
              {displayComments.map((c) => {
                const status = getCommentStatus(c);
                const matchFailed = status === 'accepted' && failedAcceptIds.includes(c.id);
                return (
                  <div key={c.id} className={`p-2.5 rounded border text-xs transition-colors ${
                    matchFailed
                      ? 'border-yellow-600 bg-yellow-900/20'
                      : status === 'accepted'
                        ? 'border-green-600 bg-green-900/20'
                        : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                  }`}>
                    {/* Type badge + explanation */}
                    <div className="flex items-start gap-1.5 mb-1.5">
                      <span className={`shrink-0 text-xs mt-0.5 ${typeColor(c.type)}`}>{typeIcon(c.type)}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${typeColor(c.type)}`}>
                          {typeLabel(c.type)}
                        </span>
                        {isGlossaryComment(c) && (
                          <span className="ml-1 px-1 py-0.5 rounded bg-green-900/50 text-green-300 border border-green-800/50 text-[9px]">
                            📚 {ui.review.glossaryBadge}
                          </span>
                        )}
                        {c.section && <span className="text-gray-500 ml-1">· {c.section}</span>}
                      </div>
                    </div>
                    <p className="text-gray-300 mb-1.5">{c.explanation}</p>
                    {matchFailed && (
                      <p className="text-[10px] text-yellow-400/90 mb-1.5 italic">
                        ⚠ {ui.review.replacementFailed}
                      </p>
                    )}

                    {/* Original → Suggested diff */}
                    {c.originalText && c.suggestedText && (
                      <div className="mb-1.5 space-y-0.5">
                        {c.originalText !== c.suggestedText && (
                          <div className="text-red-400/70 line-through text-[11px] bg-red-900/10 px-1.5 py-0.5 rounded">
                            {c.originalText.length > 120 ? c.originalText.slice(0, 120) + '…' : c.originalText}
                          </div>
                        )}
                        <div className="text-green-400/80 text-[11px] bg-green-900/10 px-1.5 py-0.5 rounded">
                          {c.suggestedText.length > 120 ? c.suggestedText.slice(0, 120) + '…' : c.suggestedText}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-1.5">
                      {c.suggestedText ? (
                        <>
                          <button onClick={() => toggleAccept(c)}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                              status === 'accepted'
                                ? 'bg-green-700 text-white hover:bg-green-800'
                                : 'bg-green-700/50 text-green-300 hover:bg-green-700'
                            }`}>
                            {status === 'accepted' ? `✓ ${ui.common.accepted}` : ui.review.accept}
                          </button>
                          <button onClick={() => {
                            if (status === 'accepted') toggleAccept(c);
                          }}
                            className={`px-2.5 py-1 rounded text-xs transition-colors ${
                              status === 'accepted'
                                ? 'bg-red-700/50 text-red-300 hover:bg-red-700'
                                : 'bg-gray-700 text-gray-400 hover:bg-red-900/50'
                            }`}>
                            {status === 'accepted' ? `✗ ${ui.review.undo}` : ui.review.ignore}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500 italic">{ui.review.viewOnly}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {ui.review.draftEditable}
            </span>
            <span className="text-xs text-gray-500">
              {accepted.size > 0 && (
                <>
                  <span className="text-green-400">{formatUi(ui.review.appliedCount, { count: accepted.size - failedAcceptIds.length })}</span>
                  {failedAcceptIds.length > 0 && (
                    <span className="text-yellow-400 ml-2">{formatUi(ui.review.unmatchedCount, { count: failedAcceptIds.length })}</span>
                  )}
                </>
              )}
            </span>
          </div>
          {editorMode === 'xml' ? (
            <HighlightedTextarea
              value={effectiveContent}
              onChange={handleManualEdit}
              className="bg-gray-900"
              placeholder={ui.review.ditaPlaceholder}
            />
          ) : (
            <textarea
              className="flex-1 bg-gray-900 text-gray-300 text-sm p-4 resize-none outline-none font-mono"
              value={effectiveContent}
              onChange={(e) => handleManualEdit(e.target.value)}
            />
          )}
          {onAiEdit && (
            <AiArtifactChat
              currentContent={effectiveContent}
              onAiEdit={onAiEdit}
              onApply={handleManualEdit}
              artifactLabel={aiArtifactLabel}
            />
          )}
          <div className="px-4 py-3 border-t border-gray-700 bg-gray-800 flex items-center gap-2">
            {footerLeft ? (
              <div className="mr-auto flex items-center gap-2">{footerLeft}</div>
            ) : (
              <span className="text-xs text-gray-500 mr-auto">
                {leftPanel === 'original'
                  ? ui.review.localizedEditHint
                  : ui.review.applySuggestionHint}
              </span>
            )}
            <button
              onClick={() => {
                // Build the full edited drafts array: apply the active doc's
                // effective content to its slot, keep the rest unchanged (M1).
                const editedDrafts = drafts.map((d, i) =>
                  i === activeDoc
                    ? { ...d, content: effectiveContent, updatedAt: new Date().toISOString() }
                    : d
                );
                onSubmit(editedDrafts, Array.from(accepted));
              }}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
