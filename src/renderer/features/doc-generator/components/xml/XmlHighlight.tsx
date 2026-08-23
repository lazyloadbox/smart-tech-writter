import React, { useMemo } from 'react';
import { tokenizeXml, type XmlTokenType } from './xmlTokenizer';

/** Tailwind classes applied per token type (shared by preview + editor). */
export const XML_TOKEN_CLASS: Record<XmlTokenType, string> = {
  text: 'text-gray-300',
  tag: 'text-blue-400',
  tagName: 'text-sky-300',
  attrName: 'text-amber-300',
  attrValue: 'text-green-300',
  comment: 'text-gray-500 italic',
  cdata: 'text-purple-300',
  doctype: 'text-purple-300',
  pi: 'text-purple-300',
  entity: 'text-yellow-300',
};

/**
 * Renders the tokenized XML as colored `<span>`s. Used both by the
 * read-only `<pre>` preview and by the overlay layer of the editable
 * highlighted textarea (so both stay perfectly aligned).
 */
export const XmlTokenSpans: React.FC<{ code: string }> = ({ code }) => {
  const tokens = useMemo(() => tokenizeXml(code), [code]);
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={XML_TOKEN_CLASS[t.type]}>
          {t.value}
        </span>
      ))}
    </>
  );
};

interface XmlHighlightProps {
  code: string;
  /** Extra classes appended to the `<pre>` (e.g. `max-h-96`). */
  className?: string;
}

/**
 * Read-only DITA/XML preview with syntax highlighting.
 * Preserves exact whitespace (`whitespace-pre`) and scrolls horizontally
 * for long lines, matching the previous plain-`<pre>` behavior.
 */
export const XmlHighlight: React.FC<XmlHighlightProps> = ({ code, className = '' }) => (
  <pre
    className={`p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto whitespace-pre border border-gray-700 font-mono ${className}`}
  >
    <code>
      <XmlTokenSpans code={code} />
    </code>
  </pre>
);