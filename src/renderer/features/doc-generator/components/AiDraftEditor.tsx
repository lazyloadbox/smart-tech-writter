import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DocumentDraft } from '../../../../shared/types/document.types';
import { en as ui } from '../../../../shared/i18n';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AiArtifactChat } from './AiArtifactChat';

interface AiDraftEditorProps {
  drafts: DocumentDraft[];
  /** Called whenever the edited content changes (so parent can store it). */
  onContentChange?: (content: string) => void;
  /** Called with the complete edited drafts array (supports multi-document review). */
  onDraftsChange?: (drafts: DocumentDraft[]) => void;
  /** Invoke the AI edit IPC. Returns the edited markdown. */
  onAiEdit: (currentContent: string, instruction: string) => Promise<string>;
}

type DraftViewMode = 'editor' | 'split' | 'preview';

/**
 * Stage 3a (review_draft) editor with AI prompt-based editing.
 *
 * Layout:
 * - Left: editable textarea of the draft markdown (user can manually edit too)
 * - Right: live rendered markdown preview
 * - Bottom: shared chat input. Each turn sends the current content + human
 *   instruction to the AI, then applies the returned Markdown to the editor.
 *   The user can undo the last AI edit before continuing.
 *
 * The complete edited drafts are reported up via onDraftsChange so the parent
 * (review_draft stage) can store them and apply them when continuing.
 */
export const AiDraftEditor: React.FC<AiDraftEditorProps> = ({ drafts, onContentChange, onDraftsChange, onAiEdit }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [content, setContent] = useState(drafts[activeIdx]?.content ?? '');
  // Keep the last pre-edit content so the user can undo an AI edit.
  const lastContentRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const [viewMode, setViewMode] = useState<DraftViewMode>('split');
  const [editorWidth, setEditorWidth] = useState(50);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);

  // Sync local content when the active draft changes.
  useEffect(() => {
    setContent(drafts[activeIdx]?.content ?? '');
    lastContentRef.current = '';
  }, [activeIdx, drafts[activeIdx]?.id]);

  const commitContent = useCallback((nextContent: string) => {
    setContent(nextContent);
    onContentChange?.(nextContent);
    onDraftsChange?.(drafts.map((draft, index) => index === activeIdx
      ? { ...draft, content: nextContent, updatedAt: new Date().toISOString() }
      : draft));
  }, [activeIdx, drafts, onContentChange, onDraftsChange]);

  const handleAiEdit = useCallback((currentContent: string, instruction: string) => {
    // Capture the exact baseline used for this request so Undo never loses a
    // manual edit made immediately before the conversation turn.
    lastContentRef.current = currentContent;
    return onAiEdit(currentContent, instruction);
  }, [onAiEdit]);

  const handleUndo = () => {
    if (lastContentRef.current) {
      commitContent(lastContentRef.current);
      lastContentRef.current = '';
    }
  };

  const syncScroll = useCallback((source: 'editor' | 'preview') => {
    if (viewMode !== 'split' || syncingScrollRef.current) return;
    const editor = textareaRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;
    const from = source === 'editor' ? editor : preview;
    const to = source === 'editor' ? preview : editor;
    const verticalRange = from.scrollHeight - from.clientHeight;
    const horizontalRange = from.scrollWidth - from.clientWidth;
    syncingScrollRef.current = true;
    if (verticalRange > 0) {
      const ratio = from.scrollTop / verticalRange;
      to.scrollTop = ratio * Math.max(0, to.scrollHeight - to.clientHeight);
    }
    if (horizontalRange > 0) {
      const ratio = from.scrollLeft / horizontalRange;
      to.scrollLeft = ratio * Math.max(0, to.scrollWidth - to.clientWidth);
    }
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, [viewMode]);

  useEffect(() => {
    if (!isDraggingDivider) return;
    const handlePointerMove = (event: PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setEditorWidth(Math.min(75, Math.max(25, nextWidth)));
    };
    const stopDragging = () => setIsDraggingDivider(false);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [isDraggingDivider]);

  if (drafts.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">{ui.docGenerator.noDrafts}</p>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Draft tabs */}
      {drafts.length > 1 && (
        <div className="flex border-b border-gray-700 px-4 bg-gray-800 shrink-0">
          {drafts.map((d, idx) => (
            <button
              key={d.id}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                idx === activeIdx ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 flex items-center justify-end gap-1 border-b border-gray-700 bg-gray-800 px-3 py-1.5">
        <span className="mr-2 text-[11px] text-gray-500">{ui.docGenerator.viewMode}</span>
        {([
          ['editor', ui.docGenerator.draftOnly],
          ['split', ui.docGenerator.splitView],
          ['preview', ui.docGenerator.previewOnly],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
              viewMode === mode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Draft and preview panes. In split mode the divider is draggable. */}
      <div ref={splitContainerRef} className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor */}
        {viewMode !== 'preview' && <div
          style={viewMode === 'split' ? { width: `${editorWidth}%` } : { width: '100%' }}
          className="flex min-w-0 flex-col overflow-hidden border-r border-gray-700"
        >
          <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center justify-between">
            <span className="text-xs text-gray-400">📝 {ui.review.draftEditable}</span>
            {lastContentRef.current && (
              <button
                onClick={handleUndo}
                className="text-xs text-yellow-400 hover:text-yellow-300"
                title={ui.docGenerator.undoAiEdit}
              >
                ↩ {ui.docGenerator.undoAiEdit}
              </button>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="flex-1 bg-gray-900 text-gray-300 text-sm p-4 resize-none outline-none font-mono overflow-y-auto"
            value={content}
            onChange={(e) => commitContent(e.target.value)}
            onScroll={() => syncScroll('editor')}
            placeholder={ui.review.draftEditable}
          />
        </div>}
        {viewMode === 'split' && (
          <button
            type="button"
            aria-label={ui.docGenerator.resizePanes}
            title={ui.docGenerator.resizePanes}
            onPointerDown={(event) => {
              event.preventDefault();
              setIsDraggingDivider(true);
            }}
            className={`z-10 w-1 shrink-0 cursor-col-resize border-0 bg-gray-700 p-0 transition-colors hover:bg-blue-500 ${isDraggingDivider ? 'bg-blue-500' : ''}`}
          />
        )}
        {/* Preview */}
        {viewMode !== 'editor' && <div
          style={viewMode === 'split' ? { width: `${100 - editorWidth}%` } : { width: '100%' }}
          className="flex min-w-0 flex-col overflow-hidden"
        >
          <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
            <span className="text-xs text-gray-400">👁 {ui.docGenerator.liveMarkdownPreview}</span>
          </div>
          <div ref={previewRef} onScroll={() => syncScroll('preview')} className="flex-1 overflow-auto p-4">
            <MarkdownRenderer content={content} />
          </div>
        </div>}
      </div>

      <AiArtifactChat
        currentContent={content}
        onAiEdit={handleAiEdit}
        onApply={commitContent}
        artifactLabel={drafts[activeIdx]?.title}
      />
    </div>
  );
};
