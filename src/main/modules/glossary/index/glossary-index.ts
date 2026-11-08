// Combined glossary index (design doc §2.5.2 / P2a-2).
//
// Owns the L1/L2 English index, the L1 Chinese automaton and the L3 fuzzy
// phrase index, and exposes a single `match(text)` entry point that returns
// raw evidence. Scoring, tiering and prompt rendering are the resolver's job.

import { computeSpecificity, expandEnAliases, expandZhAliases, type GlossaryAlias } from '../aliases';
import { countWords } from '../normalize';
import { buildEnIndex, EnIndex } from './en-index';
import { buildZhAutomaton, ZhAutomaton } from './zh-automaton';
import { TrigramIndex } from './trigram-index';
import type { GlossaryEntryKind } from '../../../../shared/types/mapping.types';
import type { GlossaryEntryView } from '../../../../shared/types/glossary.types';

/** Row accepted by the index builder (DB row + optional stored aliases). */
export interface GlossaryIndexRow {
  id: string;
  en: string;
  zhCN: string;
  zhTW: string;
  kind: GlossaryEntryKind;
  specificity?: number;
  /** Forbidden / deprecated wordings (P4-6). */
  doNotUse?: string[];
  aliases?: { en?: GlossaryAlias[]; zh?: GlossaryAlias[] };
  /** Extra zh-TW aliases (future opencc conversion). */
  zhTWAliases?: string[];
}

/** Raw evidence produced by the index (before fusion / tiering). */
export interface GlossaryMatch {
  entryId: string;
  layer: 'exact' | 'variant' | 'alias' | 'fuzzy';
  /** 1 for deterministic layers, TM score for fuzzy. */
  similarity: number;
  /** Text found in the document. */
  surface: string;
  /** Canonical entry text (English column). */
  canonical: string;
  start: number;
  end: number;
}

export interface GlossaryScanOptions {
  /** Match the English side, the Chinese side, or both (default both). */
  side?: 'en' | 'zh' | 'both';
  /** L2 variant matching (case / hyphen / plural). Default true. */
  enableVariant?: boolean;
  /** L3 fuzzy phrase matching. Default true. */
  enableFuzzy?: boolean;
  /** Minimum fuzzy score. Default 0.75. */
  fuzzyThreshold?: number;
  /** Upper bound on fuzzy sentences (protects very large documents). */
  maxSentences?: number;
}

/** DITA elements whose content must never be glossary-matched. */
const VERBATIM_ELEMENT_RE =
  /<(codeblock|codeoutput|screen|pre|codeph|cmdname|filepath|userinput|systemoutput|varname|option|parmname|apiname|msgph|kwd|q)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/**
 * Convert DITA/XML to plain text while **preserving character offsets**: every
 * removed tag / verbatim block is replaced by spaces of the same length, so
 * match offsets still point at the right place in the original content.
 */
export function preparePlainText(text: string): string {
  let out = text ?? '';
  out = out.replace(VERBATIM_ELEMENT_RE, (m) => ' '.repeat(m.length));
  // Comments are not content; DOCTYPE / PI are metadata.
  out = out.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  out = out.replace(/<!DOCTYPE[^>]*>/gi, (m) => ' '.repeat(m.length));
  out = out.replace(/<\?[\s\S]*?\?>/g, (m) => ' '.repeat(m.length));
  // Remaining markup.
  out = out.replace(/<[^>]*>/g, (m) => ' '.repeat(m.length));
  return out;
}

interface Sentence {
  text: string;
  start: number;
}

/** Split plain text into sentence-ish segments for fuzzy matching. */
export function splitSentences(plain: string): Sentence[] {
  const sentences: Sentence[] = [];
  const regex = /[^.!?。！？\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(plain)) !== null) {
    const text = match[0].trim();
    if (text.length < 12) continue;
    sentences.push({ text, start: match.index });
  }
  return sentences;
}

/** Unified glossary index over English, Chinese and phrase layers. */
export class GlossaryIndex {
  readonly entries = new Map<string, GlossaryEntryView>();
  private enIndex: EnIndex;
  private zhAutomaton: ZhAutomaton;
  private phrases = new TrigramIndex();

  constructor(rows: GlossaryIndexRow[]) {
    const enRows: Parameters<typeof buildEnIndex>[0] = [];
    const zhRows: Parameters<typeof buildZhAutomaton>[0] = [];

    for (const row of rows) {
      const specificity = row.specificity ?? computeSpecificity(row);
      this.entries.set(row.id, {
        id: row.id,
        en: row.en,
        zhCN: row.zhCN,
        zhTW: row.zhTW,
        kind: row.kind,
        specificity,
        doNotUse: row.doNotUse && row.doNotUse.length > 0 ? row.doNotUse : undefined,
      });

      const enAliases = row.aliases?.en?.length ? row.aliases.en : expandEnAliases(row.en);
      const zhAliases = row.aliases?.zh?.length
        ? row.aliases.zh
        : expandZhAliases([row.zhCN, row.zhTW].filter(Boolean).join('、'));

      enRows.push({ id: row.id, kind: row.kind, specificity, aliases: enAliases });
      zhRows.push({ id: row.id, zhCN: row.zhCN, zhTW: row.zhTW, aliases: zhAliases, zhTWAliases: row.zhTWAliases });

      // Fuzzy index: sentence-like entries and long terms only.
      const isPhrase =
        row.kind === 'phrase' ||
        countWords(row.en) >= 4 ||
        (row.zhCN.length >= 8 && /[\u3400-\u9fff]/.test(row.zhCN));
      if (isPhrase) this.phrases.add(row.id, row.en || row.zhCN);
    }

    this.enIndex = buildEnIndex(enRows);
    this.zhAutomaton = buildZhAutomaton(zhRows);
  }

  get size(): number {
    return this.entries.size;
  }

  getEntry(entryId: string): GlossaryEntryView | undefined {
    return this.entries.get(entryId);
  }

  /** Scan text and return raw, unfused evidence. */
  match(text: string, opts: GlossaryScanOptions = {}): GlossaryMatch[] {
    const side = opts.side ?? 'both';
    const enableVariant = opts.enableVariant ?? true;
    const enableFuzzy = opts.enableFuzzy ?? true;
    const fuzzyThreshold = opts.fuzzyThreshold ?? 0.75;
    const maxSentences = opts.maxSentences ?? 400;

    const plain = preparePlainText(text);
    const matches: GlossaryMatch[] = [];

    if (side !== 'zh') {
      for (const hit of this.enIndex.match(plain, { enableVariant })) {
        const entry = this.entries.get(hit.entryId);
        matches.push({
          entryId: hit.entryId,
          layer: hit.layer,
          similarity: 1,
          surface: hit.matched,
          canonical: entry?.en ?? hit.surface,
          start: hit.start,
          end: hit.end,
        });
      }
    }

    if (side !== 'en') {
      for (const hit of this.zhAutomaton.match(plain)) {
        const entry = this.entries.get(hit.entryId);
        matches.push({
          entryId: hit.entryId,
          layer: hit.layer,
          similarity: 1,
          surface: hit.matched,
          canonical: entry?.en ?? hit.surface,
          start: hit.start,
          end: hit.end,
        });
      }
    }

    if (enableFuzzy && this.phrases.length > 0) {
      const sentences = splitSentences(plain).slice(0, maxSentences);
      for (const sentence of sentences) {
        for (const candidate of this.phrases.query(sentence.text, 5)) {
          if (candidate.score < fuzzyThreshold) continue;
          const entry = this.entries.get(candidate.entryId);
          matches.push({
            entryId: candidate.entryId,
            layer: 'fuzzy',
            similarity: candidate.score,
            surface: sentence.text,
            canonical: entry?.en ?? '',
            start: sentence.start,
            end: sentence.start + sentence.text.length,
          });
        }
      }
    }

    return matches;
  }
}
