/**
 * Lightweight DITA concept → Markdown conversion (design §3.5 / S3-1).
 *
 * `buildDocx` parses Markdown, but the export pipeline stores DITA XML in
 * `DocumentDraft.content`. Before S3 the XML was fed to the Markdown parser,
 * so DOCX files contained literal XML text. This module reverses the builder's
 * most important constructs so DOCX (and any other Markdown consumer) gets real
 * headings, paragraphs, lists and code blocks:
 *
 *   concept/title      → `# title`
 *   section/title      → `## title`
 *   shortdesc / p      → paragraph
 *   ul / ol / li       → markdown lists
 *   codeblock          → fenced code block
 *   b / i / codeph / xref / u → inline markdown
 *
 * Unknown elements render their children, so the converter never loses text.
 */

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlChild[];
}

type XmlChild = string | XmlNode;

const TOKEN_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[\s\S]*?>|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w.-]*)((?:\s+[^<>]*?)?)(\/?)>|([^<]+)/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw) return attrs;
  const re = /([a-zA-Z_:][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/** Parse the XML string into a minimal node tree (well-formed input expected). */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  const regex = new RegExp(TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const [full, cdata, closing, tagName, attrsRaw, selfClosing, text] = match;
    const parent = stack[stack.length - 1];

    if (full.startsWith('<!--') || full.startsWith('<!DOCTYPE') || full.startsWith('<?')) {
      continue;
    }
    if (cdata !== undefined) {
      parent.children.push(cdata);
      continue;
    }
    if (text !== undefined) {
      parent.children.push(decodeEntities(text));
      continue;
    }
    if (tagName) {
      if (closing) {
        // Pop to the matching open tag (tolerates minor malformation).
        const idx = stack.map((node) => node.tag).lastIndexOf(tagName);
        if (idx > 0) stack.length = idx;
        continue;
      }
      const node: XmlNode = { tag: tagName, attrs: parseAttrs(attrsRaw), children: [] };
      parent.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }

  return root;
}

/** Inline rendering: bold/italic/code/links/underline. */
function renderInline(children: XmlChild[]): string {
  let out = '';
  for (const child of children) {
    if (typeof child === 'string') {
      out += child;
      continue;
    }
    switch (child.tag) {
      case 'b':
      case 'strong':
        out += `**${renderInline(child.children)}**`;
        break;
      case 'i':
      case 'em':
        out += `*${renderInline(child.children)}*`;
        break;
      case 'codeph':
      case 'code':
        out += `\`${renderInline(child.children)}\``;
        break;
      case 'u':
        out += `~~${renderInline(child.children)}~~`;
        break;
      case 'xref': {
        const href = child.attrs.href ?? '';
        const text = renderInline(child.children) || href;
        out += href ? `[${text}](${href})` : text;
        break;
      }
      case 'image': {
        const href = child.attrs.href ?? '';
        const alt = renderInline(child.children) || href;
        out += href ? `![${alt}](${href})` : alt;
        break;
      }
      case 'ph':
      case 'term':
      case 'keyword':
      default:
        out += renderInline(child.children);
        break;
    }
  }
  return out;
}

/** Plain text of a node's children (used for titles / list items). */
function renderText(children: XmlChild[]): string {
  return renderInline(children).replace(/\s+/g, ' ').trim();
}

function firstTitle(node: XmlNode): XmlNode | undefined {
  return node.children.find((c): c is XmlNode => typeof c !== 'string' && c.tag === 'title');
}

/** Render a `<ul>` / `<ol>` child list. */
function renderList(node: XmlNode, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let counter = 1;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag !== 'li') continue;
    const nested = child.children.filter((c): c is XmlNode => typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol'));
    const inlineChildren = child.children.filter((c) => typeof c === 'string' || (c.tag !== 'ul' && c.tag !== 'ol'));
    const marker = ordered ? `${counter++}.` : '-';
    lines.push(`${indent}${marker} ${renderText(inlineChildren as XmlChild[])}`);
    for (const list of nested) lines.push(renderList(list, list.tag === 'ol', depth + 1));
  }
  return lines.join('\n');
}

/** Render a block-level node into Markdown. */
function renderBlock(node: XmlNode, parentTag: string): string {
  switch (node.tag) {
    case 'title': {
      const text = renderText(node.children);
      if (parentTag === 'concept' || parentTag === '#root') return `# ${text}`;
      if (parentTag === 'section') return `## ${text}`;
      return `**${text}**`;
    }
    case 'shortdesc':
    case 'p':
      return renderInline(node.children).trim();
    case 'section': {
      const title = firstTitle(node);
      const parts: string[] = [];
      if (title) parts.push(renderBlock(title, 'section'));
      for (const child of node.children) {
        if (typeof child === 'string' || child === title) continue;
        parts.push(renderBlock(child, 'section'));
      }
      return parts.filter((part) => part.trim()).join('\n\n');
    }
    case 'ul':
      return renderList(node, false, 0);
    case 'ol':
      return renderList(node, true, 0);
    case 'codeblock': {
      const langClass = node.attrs.outputclass ?? '';
      const lang = langClass.startsWith('language-') ? langClass.slice('language-'.length) : '';
      const code = node.children.map((c) => (typeof c === 'string' ? c : renderText([c]))).join('');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case 'note':
    case 'conbody':
    case 'body':
    default: {
      const parts: string[] = [];
      for (const child of node.children) {
        if (typeof child === 'string') {
          const text = child.trim();
          if (text) parts.push(text);
          continue;
        }
        parts.push(renderBlock(child, node.tag));
      }
      return parts.filter((part) => part.trim()).join('\n\n');
    }
  }
}

/** Convert a DITA concept XML document into Markdown. */
export function ditaToMarkdown(xml: string): string {
  if (!xml?.trim()) return '';
  const tree = parseXml(xml);
  const concept = tree.children.find(
    (c): c is XmlNode => typeof c !== 'string' && c.tag === 'concept'
  );
  const target = concept ?? tree;
  const parts: string[] = [];
  for (const child of target.children) {
    if (typeof child === 'string') {
      const text = child.trim();
      if (text) parts.push(text);
      continue;
    }
    parts.push(renderBlock(child, target.tag));
  }
  return parts.filter((part) => part.trim()).join('\n\n').trim();
}
