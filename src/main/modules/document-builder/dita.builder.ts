import type { DocumentDraft } from '../../../shared/types/document.types';
import { en as ui, formatUi } from '../../../shared/i18n';

/**
 * Simple DITA topic builder — converts a Markdown draft into a DITA 1.3 concept topic.
 *
 * Inline Markdown (bold/italic/code/links/strikethrough) is converted to DITA
 * inline elements (`<b>`, `<i>`, `<codeph>`, `<xref>`, `<u>`), and any leftover
 * Markdown markers are stripped — so no literal `**` / `*` ever leaks into the
 * generated DITA (previously the DITA AI review flagged these as issues).
 *
 * Structure:
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
 *   <concept id="...">
 *     <title>...</title>
 *     <conbody>
 *       <p>...</p>
 *       <section><title>...</title><p>...</p></section>
 *       <ul><li>...</li></ul>
 *       <codeblock>...</codeblock>
 *       ...
 *     </conbody>
 *   </concept>
 */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert inline Markdown formatting into DITA inline elements, then escape
 * the remaining text for XML.
 *
 * Handles: **bold** / __bold__, *italic* / _italic_, `code`, [text](url),
 * ![alt](url), ~~strikethrough~~. Any leftover Markdown markers (unmatched
 * `**`, `*`, backticks, etc.) are stripped so no literal `**` / `*` leaks
 * into the DITA output — previously the LLM-generated Markdown drafts were
 * only XML-escaped, so `**Duty control**` appeared verbatim in the DITA and
 * triggered repeated "uses ** around ..." warnings in the DITA AI review.
 */
function inlineMarkdownToDita(text: string): string {
  // Escape XML first: the Markdown markers contain no XML-special characters,
  // so the regexes below operate safely on the escaped text.
  let out = escapeXml(text);

  // Images: ![alt](url) → alt text (DITA concept topics don't inline images here).
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+\))/g, '$1');

  // Bold: **text** or __text__.
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/__([^_]+)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ (single markers; content must not start/end with space).
  out = out.replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<i>$2</i>');
  out = out.replace(/(^|[^_])_([^_\s][^_\n]*?)_(?!_)/g, '$1<i>$2</i>');

  // Inline code: `code`.
  out = out.replace(/`([^`\n]+)`/g, '<codeph>$1</codeph>');

  // Links: [text](url).
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<xref href="$2">$1</xref>');

  // Strikethrough: ~~text~~ → underline (DITA has no native strikethrough).
  out = out.replace(/~~([^~]+)~~/g, '<u>$1</u>');

  // Strip any leftover Markdown emphasis markers so they never appear literally.
  out = out.replace(/\*\*/g, '').replace(/__/g, '');
  out = out.replace(/(^|[^*\w])\*([^*\n]{2,})\*(?!\*)/g, '$1$2');
  out = out.replace(/`/g, '');
  out = out.replace(/~~/g, '');

  return out;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'topic';
}

interface Block {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'codeblock' | 'empty' | 'hr';
  content?: string;
  items?: string[];
  lang?: string;
}

function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (fenced)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'codeblock', content: codeLines.join('\n'), lang });
      continue;
    }

    // Headings
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1) { blocks.push({ type: 'h1', content: h1[1] }); i++; continue; }
    if (h2) { blocks.push({ type: 'h2', content: h2[1] }); i++; continue; }
    if (h3) { blocks.push({ type: 'h3', content: h3[1] }); i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      // Collapse consecutive empty lines
      if (blocks.length === 0 || blocks[blocks.length - 1].type !== 'empty') {
        blocks.push({ type: 'empty' });
      }
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Regular paragraph
    blocks.push({ type: 'p', content: line });
    i++;
  }

  return blocks;
}

function blocksToDitaBody(blocks: Block[]): string {
  const parts: string[] = [];
  let currentSection: { title: string; bodyParts: string[] } | null = null;

  function flushSection(): void {
    if (currentSection && currentSection.bodyParts.length > 0) {
      parts.push(`<section><title>${inlineMarkdownToDita(currentSection.title)}</title>`);
      parts.push(...currentSection.bodyParts);
      parts.push('</section>');
    }
    currentSection = null;
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'h1':
        // H1 becomes the main title — already handled outside
        flushSection();
        // H1 inside body becomes a section
        currentSection = { title: block.content ?? '', bodyParts: [] };
        break;

      case 'h2':
        flushSection();
        currentSection = { title: block.content ?? '', bodyParts: [] };
        break;

      case 'h3':
        // H3 inside a section as a sub-heading paragraph
        if (currentSection) {
          currentSection.bodyParts.push(`<p><b>${inlineMarkdownToDita(block.content ?? '')}</b></p>`);
        } else {
          currentSection = { title: block.content ?? '', bodyParts: [] };
        }
        break;

      case 'p':
        if (currentSection) {
          currentSection.bodyParts.push(`<p>${inlineMarkdownToDita(block.content ?? '')}</p>`);
        } else {
          parts.push(`<p>${inlineMarkdownToDita(block.content ?? '')}</p>`);
        }
        break;

      case 'ul':
        if (block.items && block.items.length > 0) {
          const ulContent = block.items.map((item) => `<li><p>${inlineMarkdownToDita(item)}</p></li>`).join('');
          const ulTag = `<ul>${ulContent}</ul>`;
          if (currentSection) {
            currentSection.bodyParts.push(ulTag);
          } else {
            parts.push(ulTag);
          }
        }
        break;

      case 'ol':
        if (block.items && block.items.length > 0) {
          const olContent = block.items.map((item) => `<li><p>${inlineMarkdownToDita(item)}</p></li>`).join('');
          const olTag = `<ol>${olContent}</ol>`;
          if (currentSection) {
            currentSection.bodyParts.push(olTag);
          } else {
            parts.push(olTag);
          }
        }
        break;

      case 'codeblock':
        {
          const outputclass = block.lang ? ` outputclass="language-${escapeXml(block.lang)}"` : '';
          const codeTag = `<codeblock${outputclass}>${escapeXml(block.content ?? '')}</codeblock>`;
          if (currentSection) {
            currentSection.bodyParts.push(codeTag);
          } else {
            parts.push(codeTag);
          }
        }
        break;

      case 'hr':
        flushSection();
        break;

      case 'empty':
        // skip
        break;
    }
  }

  flushSection();
  return parts.join('\n');
}

export function buildDitaXml(draft: DocumentDraft): string {
  const blocks = parseMarkdownBlocks(draft.content);
  const topicId = slugify(draft.title);

  // First H1 becomes the topic title if present; otherwise use draft.title
  let titleText = draft.title;
  let bodyBlocks = blocks;

  if (blocks.length > 0 && blocks[0].type === 'h1') {
    titleText = blocks[0].content ?? draft.title;
    bodyBlocks = blocks.slice(1);
  }

  const conbody = blocksToDitaBody(bodyBlocks);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">',
    `<concept id="${topicId}">`,
    `  <title>${inlineMarkdownToDita(titleText)}</title>`,
    '  <conbody>',
    conbody
      .split('\n')
      .map((line) => (line.trim() ? `    ${line}` : ''))
      .filter(Boolean)
      .join('\n'),
    '  </conbody>',
    '</concept>',
  ].join('\n');

  return xml;
}

export async function buildDita(draft: DocumentDraft): Promise<Buffer> {
  const xml = buildDitaXml(draft);
  return Buffer.from(xml, 'utf-8');
}

/**
 * Lightweight XML well-formedness validation (M8).
 *
 * The builder is deterministic and escapes all text, but this is a safety net
 * for hand-edited DITA (the human review stage lets users edit raw XML) and
 * for future builder changes. Checks:
 *  1. XML declaration present.
 *  2. Exactly one root element.
 *  3. Balanced, properly nested tags (stack-based).
 *  4. No unescaped `&` or `<` in text content (outside tags/comments/CDATA).
 */
export function validateDitaXml(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const text = xml ?? '';

  if (!text.trim().startsWith('<?xml')) {
    errors.push(ui.backend.missingXmlDeclaration);
  }

  // Find all tags (opening, closing, self-closing, processing instructions,
  // comments, CDATA, and the DOCTYPE declaration).
  const tagRegex = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[\s\S]*?>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][\w.-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  let rootCount = 0;
  let lastTagEnd = 0;

  while ((match = tagRegex.exec(text)) !== null) {
    const full = match[0];
    // Skip comments / CDATA / DOCTYPE / processing instructions (no tag name captured).
    if (full.startsWith('<!--') || full.startsWith('<![CDATA[') || full.startsWith('<!DOCTYPE') || full.startsWith('<?')) {
      lastTagEnd = tagRegex.lastIndex;
      continue;
    }
    const tagName = match[1];
    const selfClosing = match[3] === '/';

    // Check for unescaped special chars in the text between this tag and the
    // previous one. A raw '<' is never valid in text; '&' is only valid when
    // it starts a well-formed entity reference (&amp; / &#123; / &#x1F;).
    const between = text.slice(lastTagEnd, match.index);
    const badAmp = between.match(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][\w.]*);)/g);
    if (between.includes('<') || (badAmp && badAmp.length > 0)) {
      errors.push(formatUi(ui.backend.unescapedXmlCharacters, { text: between.slice(0, 40) }));
    }

    if (full.startsWith('</')) {
      const open = stack.pop();
      if (open !== tagName) {
        errors.push(formatUi(ui.backend.mismatchedXmlTag, { tag: tagName, open: open ?? 'none' }));
      }
    } else if (!selfClosing) {
      // Only the first element at depth 0 is the root.
      if (stack.length === 0) {
        rootCount++;
        if (rootCount > 1) {
          errors.push(formatUi(ui.backend.multipleXmlRoots, { tag: tagName }));
        }
      }
      stack.push(tagName);
    }
    lastTagEnd = tagRegex.lastIndex;
  }

  if (stack.length > 0) {
    errors.push(formatUi(ui.backend.unclosedXmlTags, { tags: stack.join(', ') }));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Best-effort repair of common XML well-formedness issues (M8 follow-up).
 *
 * Fixes:
 *  1. Unescaped `&` in text content → `&amp;` (valid entity references are kept).
 *  2. Stray `<` in text content → `&lt;` (tags/comments/CDATA/DOCTYPE/PI are kept).
 *  3. Unclosed tags at the end of the document → closed in reverse order.
 *
 * Structural issues that cannot be safely auto-fixed (e.g. mismatched tag
 * nesting, multiple roots) are left as-is and will still be reported by
 * `validateDitaXml`.
 */
export function repairDitaXml(xml: string): string {
  const text = xml ?? '';
  const tagRegex = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[\s\S]*?>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][\w.-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const stack: string[] = [];
  let out = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    // Text between tokens: escape stray `&` / `<`.
    out += escapeXmlText(match.index > lastIndex ? text.slice(lastIndex, match.index) : '');
    const full = match[0];
    if (full.startsWith('<!--') || full.startsWith('<![CDATA[') || full.startsWith('<!DOCTYPE') || full.startsWith('<?')) {
      out += full;
    } else if (full.startsWith('</')) {
      const tagName = match[1];
      const idx = stack.lastIndexOf(tagName);
      if (idx >= 0) {
        // Implicitly close any tags opened after `tagName` first, then let
        // `full` close `tagName` itself (fixes e.g. `</conbody>` while `<p>`
        // is still open → inserts `</p>` before `</conbody>`).
        for (let j = stack.length - 1; j > idx; j--) {
          out += `</${stack[j]}>`;
        }
        stack.length = idx;
      }
      out += full;
    } else if (match[3] !== '/') {
      stack.push(match[1]);
      out += full;
    } else {
      out += full;
    }
    lastIndex = tagRegex.lastIndex;
  }
  // Trailing text after the last token.
  out += escapeXmlText(text.slice(lastIndex));

  // Close any tags left open at the end of the document.
  for (let i = stack.length - 1; i >= 0; i--) {
    out += `</${stack[i]}>`;
  }

  return out;
}

/** Escape `&` (unless a valid entity) and stray `<` in XML text content. */
function escapeXmlText(text: string): string {
  if (!text) return text;
  return text
    .replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][\w.]*);)/g, '&amp;')
    .replace(/</g, '&lt;');
}

export interface DitaValidationResult {
  /** Final content (auto-repaired if issues were found and fixable). */
  content: string;
  /** Whether the final content is well-formed. */
  valid: boolean;
  /** Whether auto-repair modified the content. */
  repaired: boolean;
  /** Remaining validation errors (empty when valid). */
  errors: string[];
}

/**
 * Validate DITA XML and, if it fails, attempt a best-effort auto-repair.
 * Returns the (possibly repaired) content plus the final validation state.
 */
export function validateAndRepairDitaXml(xml: string): DitaValidationResult {
  const first = validateDitaXml(xml);
  if (first.valid) {
    return { content: xml, valid: true, repaired: false, errors: [] };
  }
  const repairedXml = repairDitaXml(xml);
  const second = validateDitaXml(repairedXml);
  return {
    content: repairedXml,
    valid: second.valid,
    repaired: repairedXml !== xml,
    errors: second.errors,
  };
}
