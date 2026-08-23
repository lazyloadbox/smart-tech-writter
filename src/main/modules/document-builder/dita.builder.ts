import type { DocumentDraft } from '../../../shared/types/document.types';

/**
 * Simple DITA topic builder — converts a Markdown draft into a DITA 1.3 concept topic.
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
      parts.push(`<section><title>${escapeXml(currentSection.title)}</title>`);
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
          currentSection.bodyParts.push(`<p><b>${escapeXml(block.content ?? '')}</b></p>`);
        } else {
          currentSection = { title: block.content ?? '', bodyParts: [] };
        }
        break;

      case 'p':
        if (currentSection) {
          currentSection.bodyParts.push(`<p>${escapeXml(block.content ?? '')}</p>`);
        } else {
          parts.push(`<p>${escapeXml(block.content ?? '')}</p>`);
        }
        break;

      case 'ul':
        if (block.items && block.items.length > 0) {
          const ulContent = block.items.map((item) => `<li><p>${escapeXml(item)}</p></li>`).join('');
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
          const olContent = block.items.map((item) => `<li><p>${escapeXml(item)}</p></li>`).join('');
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
    `  <title>${escapeXml(titleText)}</title>`,
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
    errors.push('缺少 XML 声明 (<?xml ... ?>)');
  }

  // Find all tags (opening, closing, self-closing, processing instructions, comments).
  const tagRegex = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][\w.-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  let rootCount = 0;
  let lastTagEnd = 0;

  while ((match = tagRegex.exec(text)) !== null) {
    const full = match[0];
    // Skip comments / CDATA / processing instructions (no tag name captured).
    if (full.startsWith('<!--') || full.startsWith('<![CDATA[') || full.startsWith('<?')) {
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
      errors.push(`文本内容包含未转义的特殊字符: "${between.slice(0, 40)}..."`);
    }

    if (full.startsWith('</')) {
      const open = stack.pop();
      if (open !== tagName) {
        errors.push(`标签不匹配: </${tagName}> (期望 </${open ?? '无'}> 关闭)`);
      }
    } else if (!selfClosing) {
      // Only the first element at depth 0 is the root.
      if (stack.length === 0) {
        rootCount++;
        if (rootCount > 1) {
          errors.push(`存在多个根元素: <${tagName}>`);
        }
      }
      stack.push(tagName);
    }
    lastTagEnd = tagRegex.lastIndex;
  }

  if (stack.length > 0) {
    errors.push(`存在未闭合的标签: ${stack.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
