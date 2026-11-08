/**
 * DITA section splitter (design doc §3.2 — S1-1).
 *
 * Splits a final DITA concept topic into one sub-file per **top-level**
 * `<section>` inside `<conbody>`. Every sub-file reuses the original file's
 * header byte-for-byte (XML declaration + DOCTYPE + root element + document
 * title + `<conbody>` opening tag), so all generated files share the same
 * "header" as required by F2-2.
 *
 * The module is a pure function set with no Electron / filesystem
 * dependencies, so it can be unit-tested directly with vitest.
 *
 * Layout produced by the builder (`dita.builder.ts`):
 *
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
 *   <concept id="...">
 *     <title>...</title>
 *     <conbody>
 *       <p>...</p>                        ← intro (before the first section)
 *       <section><title>...</title>...</section>
 *       <section><title>...</title>...</section>
 *     </conbody>
 *   </concept>
 */

import { en as ui, formatUi } from '../../../shared/i18n';

/**
 * Single tag token: comment, CDATA, DOCTYPE, processing instruction, or a
 * real element (opening / closing / self-closing). Mirrors the regex used by
 * `validateDitaXml` so comments/CDATA containing `<section>` are never treated
 * as real sections.
 */
const TAG_SOURCE =
  '<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<!DOCTYPE[\\s\\S]*?>|<\\?[\\s\\S]*?\\?>|<\\/?([a-zA-Z][\\w.-]*)((?:\\s+[^<>]*?)?)(\\/?)>';

/** Create a fresh global tag regex (lastIndex must not be shared between calls). */
function createTagRegex(): RegExp {
  return new RegExp(TAG_SOURCE, 'g');
}

/** Comments / CDATA / DOCTYPE / processing instructions are not real tags. */
function isSkippableToken(full: string): boolean {
  return (
    full.startsWith('<!--') ||
    full.startsWith('<![CDATA[') ||
    full.startsWith('<!DOCTYPE') ||
    full.startsWith('<?')
  );
}

export interface SplitSection {
  /** 1-based index following document order. */
  index: number;
  /** Plain-text title (inline tags stripped, entities decoded, whitespace collapsed). */
  title: string;
  /** Original `<section>...</section>` fragment, kept verbatim. */
  xml: string;
}

export interface DitaSplitResult {
  /** Everything from the start of the file through the `<conbody>` opening tag (inclusive). */
  header: string;
  /** Content inside `<conbody>` before the first top-level `<section>` (trimmed). */
  intro: string;
  /**
   * Everything after the last top-level `</section>` (through `</conbody>` /
   * `</concept>`). Trailing content before `</conbody>` is moved into the last
   * section instead (see `warnings`).
   */
  footer: string;
  sections: SplitSection[];
  warnings: string[];
}

export type IntroPlacement = 'none' | 'first' | 'all';

export interface ComposeSectionOptions {
  includeIntro: IntroPlacement;
  /** Whether the section being composed is the first exported section. */
  isFirst: boolean;
}

/** Escape text for use in XML content / attribute values. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '\uFFFD';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '\uFFFD';
  }
}

/** Decode the XML entities allowed in titles (`&amp;` last to avoid double decoding). */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Turn a raw `<title>` inner fragment into plain text. */
function cleanTitleText(inner: string): string {
  const withoutCdata = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const withoutTags = withoutCdata.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/**
 * Extract the first **direct child** `<title>` of a section fragment.
 * Nested titles (inside a nested section, paragraph, …) are ignored.
 */
function extractSectionTitle(
  sectionXml: string,
  sectionIndex: number,
  warnings: string[],
): string {
  const tagRegex = createTagRegex();
  const stack: string[] = [];
  let titleStart = -1;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(sectionXml)) !== null) {
    const full = match[0];
    if (isSkippableToken(full)) continue;

    // AI-edited DITA sometimes capitalises tags (`<Title>`); element names are
    // matched case-insensitively so those sections are still recognised.
    const tagName = (match[1] ?? '').toLowerCase();
    const selfClosing = match[3] === '/';

    if (full.startsWith('</')) {
      if (tagName === 'title' && titleStart >= 0) {
        const title = cleanTitleText(sectionXml.slice(titleStart, match.index));
        if (title) return title;
        break;
      }
      const idx = stack.lastIndexOf(tagName);
      if (idx >= 0) stack.length = idx;
      else stack.pop();
    } else {
      // Direct child of the section: stack currently holds only `<section>`.
      if (tagName === 'title' && stack.length === 1 && stack[0] === 'section') {
        titleStart = tagRegex.lastIndex;
      }
      if (!selfClosing) stack.push(tagName);
    }
  }

  warnings.push(formatUi(ui.backend.splitSectionNoTitle, { index: sectionIndex }));
  return `Section ${sectionIndex}`;
}

/**
 * Split a final DITA concept XML into a shared header, intro, footer and one
 * entry per top-level `<section>`.
 *
 * When the input has no `<conbody>` or no top-level section, `sections` is
 * empty and a warning explains why (the caller should tell the user that the
 * document cannot be split).
 */
export function splitDitaBySections(xml: string): DitaSplitResult {
  const text = xml ?? '';
  const warnings: string[] = [];
  const sections: SplitSection[] = [];

  if (!text.trim()) {
    warnings.push(ui.backend.splitNoConbody);
    return { header: '', intro: '', footer: text, sections, warnings };
  }

  const tagRegex = createTagRegex();
  const stack: string[] = [];

  let bodyStart = -1;
  let bodyEnd = -1;
  let firstSectionStart = -1;
  let lastSectionEnd = -1;

  let sectionStart = -1;
  let sectionDepth = -1;
  let nestedInCurrentSection = false;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const full = match[0];
    if (isSkippableToken(full)) continue;

    const tagName = (match[1] ?? '').toLowerCase();
    const selfClosing = match[3] === '/';

    if (!full.startsWith('</')) {
      // Opening tag.
      if (tagName === 'conbody' && bodyStart < 0) {
        bodyStart = tagRegex.lastIndex;
      }
      if (tagName === 'section') {
        const parent = stack[stack.length - 1];
        if (parent === 'conbody') {
          // Top-level section starts here.
          sectionStart = match.index;
          sectionDepth = stack.length;
          nestedInCurrentSection = false;
          if (firstSectionStart < 0) firstSectionStart = match.index;
        } else if (sectionStart >= 0 && !nestedInCurrentSection) {
          // A `<section>` inside another `<section>`: DITA does not allow
          // this, but hand-edited documents may contain it. It stays inside
          // its parent section and is reported below.
          nestedInCurrentSection = true;
        }
      }
      if (!selfClosing) stack.push(tagName);
      continue;
    }

    // Closing tag.
    if (tagName === 'conbody' && stack[stack.length - 1] === 'conbody') {
      bodyEnd = match.index;
    }
    if (
      tagName === 'section' &&
      sectionStart >= 0 &&
      stack.length === sectionDepth + 1 &&
      stack[stack.length - 1] === 'section'
    ) {
      const sectionEnd = tagRegex.lastIndex;
      const fragment = text.slice(sectionStart, sectionEnd);
      const sectionIndex = sections.length + 1;
      const title = extractSectionTitle(fragment, sectionIndex, warnings);
      if (nestedInCurrentSection) {
        warnings.push(formatUi(ui.backend.splitNestedSection, { index: sectionIndex }));
      }
      sections.push({ index: sectionIndex, title, xml: fragment });
      lastSectionEnd = sectionEnd;
      sectionStart = -1;
      sectionDepth = -1;
    }

    const idx = stack.lastIndexOf(tagName);
    if (idx >= 0) stack.length = idx;
    else stack.pop();
  }

  if (bodyStart < 0) {
    warnings.push(ui.backend.splitNoConbody);
    return { header: '', intro: '', footer: text, sections, warnings };
  }

  const header = text.slice(0, bodyStart);

  if (sections.length === 0) {
    warnings.push(ui.backend.splitNoSections);
    const intro = (bodyEnd >= 0 ? text.slice(bodyStart, bodyEnd) : text.slice(bodyStart)).trim();
    const footer = bodyEnd >= 0 ? text.slice(bodyEnd) : '';
    return { header, intro, footer, sections, warnings };
  }

  const intro = firstSectionStart >= 0 ? text.slice(bodyStart, firstSectionStart).trim() : '';

  let footer: string;
  if (bodyEnd >= 0) {
    const trailing = text.slice(lastSectionEnd, bodyEnd).trim();
    if (trailing) {
      const last = sections[sections.length - 1];
      last.xml = `${last.xml}\n${trailing}`;
      warnings.push(formatUi(ui.backend.splitTrailingContent, { index: last.index }));
    }
    footer = text.slice(bodyEnd).trimStart();
  } else {
    footer = text.slice(lastSectionEnd).trimStart();
  }

  return { header, intro, footer, sections, warnings };
}

/**
 * Compose a single sub-file from the split result.
 *
 * `subFile = header + '\n' + (intro if selected) + section.xml + '\n' + footer`
 *
 * The header is reused verbatim so every sub-file shares the exact same header
 * bytes (F2-2).
 */
export function composeSectionFile(
  result: DitaSplitResult,
  section: SplitSection,
  opts: ComposeSectionOptions,
): string {
  const includeIntro =
    opts.includeIntro === 'all' || (opts.includeIntro === 'first' && opts.isFirst);

  const parts: string[] = [];
  if (result.header) parts.push(result.header);
  if (includeIntro && result.intro) parts.push(result.intro);
  if (section.xml) parts.push(section.xml);
  if (result.footer) parts.push(result.footer);

  return parts.join('\n');
}

/**
 * Build a `.ditamap` that references the exported section files in order
 * (optional output of the split export dialog).
 */
export function buildDitaMap(docTitle: string, hrefs: string[]): string {
  const topicRefs = (hrefs ?? []).map((href) => `  <topicref href="${escapeXml(href)}"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE map PUBLIC "-//OASIS//DTD DITA Map//EN" "map.dtd">',
    '<map>',
    `  <title>${escapeXml(docTitle)}</title>`,
    ...topicRefs,
    '</map>',
  ].join('\n');
}
