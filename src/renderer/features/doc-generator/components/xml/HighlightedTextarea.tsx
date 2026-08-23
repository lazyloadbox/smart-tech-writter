import React, { useCallback, useRef } from 'react';
import { XmlTokenSpans } from './XmlHighlight';

interface HighlightedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** Extra classes for the wrapper (e.g. `bg-gray-900`). */
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

/**
 * Editable textarea with live XML syntax highlighting.
 *
 * Technique: a transparent `<textarea>` sits on top of a highlighted
 * `<div>` layer. Both layers share identical font metrics, padding,
 * `white-space` and `word-break` so the colored text stays perfectly
 * aligned with the (invisible) editable text. Scrolling is synced from
 * the textarea to the highlight layer.
 *
 * The textarea keeps its native editing behavior (cursor, selection,
 * undo/redo, IME) — only the text color is transparent while the caret
 * stays visible.
 */
export const HighlightedTextarea: React.FC<HighlightedTextareaProps> = ({
  value,
  onChange,
  className = '',
  placeholder,
  readOnly,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  return (
    <div className={`relative flex-1 min-h-0 overflow-hidden ${className}`}>
      {/* Highlight layer (behind, non-interactive) */}
      <div
        ref={highlightRef}
        aria-hidden="true"
        className="absolute inset-0 overflow-auto p-4 font-mono text-sm leading-normal whitespace-pre-wrap break-all pointer-events-none"
      >
        {value.length === 0 ? '\u00A0' : <XmlTokenSpans code={value} />}
      </div>
      {/* Editable layer (on top, transparent text, visible caret) */}
      <textarea
        ref={textareaRef}
        className="absolute inset-0 w-full h-full resize-none outline-none bg-transparent text-transparent caret-gray-100 font-mono text-sm leading-normal whitespace-pre-wrap break-all p-4 overflow-auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
      />
    </div>
  );
};