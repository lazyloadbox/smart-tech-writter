// Large-document translation chunking (design §2.7.4 / P2a-5).
//
// When a DITA document exceeds the configured character threshold, translation
// is split by top-level `<section>` so each AI call stays well inside the model
// context and output truncation cannot lose a whole document.
//
// Every chunk is a **complete, well-formed DITA concept** (shared header +
// intro or one section + footer). After translation each chunk is re-split and
// only its intro/section fragment is kept, then reassembled under the original
// header/footer. This keeps the header byte-identical across chunks and avoids
// partial XML.
//
// The module is pure (no Electron / filesystem access) so it can be unit
// tested directly.

import { composeSectionFile, splitDitaBySections } from '../document-builder/section-splitter';

export type DocumentChunkKind = 'intro' | 'section';

/** One complete DITA document handed to the translation model. */
export interface DocumentChunk {
  /** 1-based chunk index (for progress logs). */
  index: number;
  kind: DocumentChunkKind;
  /** Complete DITA XML document to translate. */
  xml: string;
}

/**
 * Plan the translation chunks for a large document.
 * Returns `null` when the document is small enough or cannot be split, in
 * which case the caller translates it in one call.
 */
export function planDocumentChunks(xml: string, thresholdChars: number): DocumentChunk[] | null {
  if (!xml || xml.length <= thresholdChars) return null;
  const split = splitDitaBySections(xml);
  if (split.sections.length <= 1) return null;

  const chunks: DocumentChunk[] = [];
  if (split.intro) {
    chunks.push({
      index: chunks.length + 1,
      kind: 'intro',
      xml: [split.header, split.intro, split.footer].filter(Boolean).join('\n'),
    });
  }
  for (const section of split.sections) {
    chunks.push({
      index: chunks.length + 1,
      kind: 'section',
      xml: composeSectionFile(split, section, { includeIntro: 'none', isFirst: false }),
    });
  }
  return chunks;
}

/**
 * Reassemble translated chunks into one document, reusing the original
 * header/footer. Missing chunks fall back to the original fragment so the
 * output is always structurally complete.
 */
export function assembleDocumentChunks(originalXml: string, translatedChunks: string[]): string {
  const split = splitDitaBySections(originalXml);
  const translated = translatedChunks.map((chunk) => splitDitaBySections(chunk));

  let cursor = 0;
  let intro = '';
  if (split.intro) {
    const first = translated[cursor++];
    // A translated intro-only document has no sections, so its `intro` holds
    // the whole `conbody` content.
    intro = first && first.sections.length === 0 ? first.intro : split.intro;
  }

  const sections = split.sections.map((original) => {
    const translatedSection = translated[cursor++];
    return translatedSection?.sections[0]?.xml ?? original.xml;
  });

  return [split.header, intro, ...sections, split.footer]
    .filter((part) => Boolean(part && part.trim()))
    .join('\n');
}
