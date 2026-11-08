import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { DocumentDraft } from '../../../shared/types/document.types';

const MONO_FONT = 'Consolas';

/**
 * Characters that are illegal in XML 1.0. `docx` copies them verbatim into
 * `document.xml`, and Word then refuses to open the file ("the file is
 * corrupt"). AI-generated Markdown occasionally contains them.
 */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function sanitizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(INVALID_XML_CHARS, '');
}

type InlineChild = TextRun | ExternalHyperlink;

/**
 * Inline Markdown → Word runs. `ditaToMarkdown` emits `**bold**`, `*italic*`,
 * `` `code` ``, `~~underline~~` and `[text](href)`; without this the DOCX body
 * showed the Markdown markers literally.
 */
const INLINE_RE = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`|~~([^~\n]+?)~~|\[([^\]\n]*)\]\(([^)\s]+)\)/g;

function isExternalLink(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href);
}

function inlineToRuns(text: string, base: { bold?: boolean; italics?: boolean } = {}): InlineChild[] {
  const runs: InlineChild[] = [];
  const regex = new RegExp(INLINE_RE.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  const pushPlain = (value: string) => {
    if (!value) return;
    runs.push(new TextRun({ text: value, bold: base.bold, italics: base.italics }));
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) pushPlain(text.slice(lastIndex, match.index));
    const bold = match[1];
    const italic = match[2];
    const code = match[3];
    const underline = match[4];
    const label = match[5];
    const href = match[6];

    if (bold !== undefined) {
      runs.push(new TextRun({ text: bold, bold: true, italics: base.italics }));
    } else if (italic !== undefined) {
      runs.push(new TextRun({ text: italic, italics: true, bold: base.bold }));
    } else if (code !== undefined) {
      runs.push(new TextRun({ text: code, font: MONO_FONT, size: 18, bold: base.bold }));
    } else if (underline !== undefined) {
      runs.push(new TextRun({ text: underline, underline: {}, bold: base.bold }));
    } else if (href !== undefined) {
      const labelText = label && label.trim() ? label : href;
      if (isExternalLink(href)) {
        runs.push(
          new ExternalHyperlink({
            link: href,
            children: [new TextRun({ text: labelText, color: '1155CC', underline: {} })],
          })
        );
      } else {
        // Relative DITA references cannot become Word hyperlinks; keep the text
        // readable instead of dropping it.
        pushPlain(labelText);
        if (labelText !== href) pushPlain(` (${href})`);
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) pushPlain(text.slice(lastIndex));
  if (runs.length === 0 && text) runs.push(new TextRun({ text }));
  return runs;
}

type NumberingConfig = {
  reference: string;
  levels: {
    level: number;
    format: (typeof LevelFormat)[keyof typeof LevelFormat];
    text: string;
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
  }[];
};

const HEADING_LEVELS: (typeof HeadingLevel)[keyof typeof HeadingLevel][] = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

interface ParsedMarkdown {
  paragraphs: Paragraph[];
  numbering: NumberingConfig[];
}

/**
 * Markdown → Word paragraphs.
 *
 * Ordered lists get a real Word numbering definition, one per list so every
 * list restarts at 1. Previously the builder referenced
 * `numbering: { reference: 'default-numbering' }` without ever defining it, so
 * `docx` wrote `w:numId w:val="{default-numbering-0}"` — not a valid integer
 * id — and Word reported the generated file as corrupt.
 */
function markdownToDocx(markdown: string): ParsedMarkdown {
  const lines = sanitizeText(markdown).split('\n');
  const paragraphs: Paragraph[] = [];
  const numbering: NumberingConfig[] = [];
  let orderedListIndex = 0;
  let currentList: 'ordered' | 'bullet' | null = null;
  let pendingBlank = false;

  const flushBlank = () => {
    if (pendingBlank && paragraphs.length > 0) paragraphs.push(new Paragraph({ text: '' }));
    pendingBlank = false;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    // ── Fenced code block ──────────────────────────────────────────────────
    if (/^```/.test(trimmed)) {
      flushBlank();
      currentList = null;
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index++;
      }
      index++; // consume the closing fence (if any)
      for (const codeLine of code.length > 0 ? code : ['']) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: codeLine || ' ', font: MONO_FONT, size: 18 })],
          })
        );
      }
      continue;
    }

    // ── Blank line (collapsed, never left dangling) ────────────────────────
    if (!trimmed) {
      if (paragraphs.length > 0) pendingBlank = true;
      currentList = null;
      index++;
      continue;
    }

    // ── Heading ────────────────────────────────────────────────────────────
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushBlank();
      const level = Math.min(heading[1].length, HEADING_LEVELS.length) - 1;
      paragraphs.push(
        new Paragraph({ heading: HEADING_LEVELS[level], children: inlineToRuns(heading[2].trim()) })
      );
      currentList = null;
      index++;
      continue;
    }

    // ── Horizontal rule (dropped; it carries no content) ────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushBlank();
      currentList = null;
      index++;
      continue;
    }

    // ── Bullet list ────────────────────────────────────────────────────────
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      flushBlank();
      const indent = bullet[1].replace(/\t/g, '  ').length;
      const depth = Math.min(Math.floor(indent / 2), 4);
      paragraphs.push(
        new Paragraph({ bullet: { level: depth }, children: inlineToRuns(bullet[2].trim()) })
      );
      currentList = 'bullet';
      index++;
      continue;
    }

    // ── Ordered list ───────────────────────────────────────────────────────
    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      flushBlank();
      if (currentList !== 'ordered') {
        orderedListIndex++;
        numbering.push({
          reference: `ordered-list-${orderedListIndex}`,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        });
      }
      paragraphs.push(
        new Paragraph({
          numbering: { reference: `ordered-list-${orderedListIndex}`, level: 0 },
          children: inlineToRuns(ordered[3].trim()),
        })
      );
      currentList = 'ordered';
      index++;
      continue;
    }

    // ── Paragraph ──────────────────────────────────────────────────────────
    flushBlank();
    paragraphs.push(
      new Paragraph({ alignment: AlignmentType.LEFT, children: inlineToRuns(trimmed) })
    );
    currentList = null;
    index++;
  }

  return { paragraphs, numbering };
}

export interface BuildDocxOptions {
  /**
   * Text placed in the Word page header. The split export uses the original
   * document title here so every section file shares the same header
   * (design §3.5 / S3-2).
   */
  headerText?: string;
  /** Emit a "Page X of Y" footer (default `true`). */
  pageNumbers?: boolean;
}

/**
 * `ditaToMarkdown` starts with `# <concept title>`, which duplicates the title
 * paragraph this builder emits from `draft.title`. Drop the leading heading when
 * it is the same text.
 */
function stripDuplicateTitle(markdown: string, title: string): string {
  if (!title) return markdown;
  const lines = markdown.split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return markdown;
  const heading = lines[first].match(/^#\s+(.*)$/);
  if (!heading) return markdown;
  const headingText = heading[1].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (headingText !== title) return markdown;
  lines.splice(first, 1);
  return lines.join('\n');
}

export async function buildDocx(draft: DocumentDraft, options: BuildDocxOptions = {}): Promise<Buffer> {
  const headerText = sanitizeText(options.headerText ?? '').trim();
  const headers = headerText
    ? {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: headerText, size: 18, color: '808080' })],
            }),
          ],
        }),
      }
    : undefined;

  const footers =
    options.pageNumbers === false
      ? undefined
      : {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', size: 18, color: '808080' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '808080' }),
                  new TextRun({ text: ' of ', size: 18, color: '808080' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '808080' }),
                ],
              }),
            ],
          }),
        };

  const { paragraphs, numbering } = markdownToDocx(
    stripDuplicateTitle(sanitizeText(draft.content ?? ''), sanitizeText(draft.title ?? '').trim())
  );
  const title = sanitizeText(draft.title ?? '').trim();

  const doc = new Document({
    ...(numbering.length > 0 ? { numbering: { config: numbering } } : {}),
    sections: [
      {
        headers,
        footers,
        children: [
          ...(title
            ? [new Paragraph({ heading: HeadingLevel.TITLE, children: inlineToRuns(title) })]
            : []),
          ...paragraphs,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

