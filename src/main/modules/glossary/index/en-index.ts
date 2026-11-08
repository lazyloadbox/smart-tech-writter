// L1/L2 English index (design doc §2.5.4 / P2a-2).
//
// The index maps the **first lemma** of every entry (and alias) to a bucket,
// so scanning a document only compares the tokens that can actually start a
// match. Buckets are sorted longest-first, which gives longest-match-wins
// semantics (`占空比寄存器` beats `占空比`, `Pulse Width Modulation` beats `Pulse`).

import { lemmaKey, tokenizeEn, type EnToken } from '../lemmatize';
import type { GlossaryAliasKind } from '../aliases';
import type { GlossaryEntryKind } from '../../../../shared/types/mapping.types';

/** One searchable English surface form (entry text or alias). */
export interface EnIndexEntry {
  entryId: string;
  /** Canonical display form of the alias. */
  surface: string;
  lemmaTokens: string[];
  aliasKind: GlossaryAliasKind;
  /** Entry specificity (low values only accept case-exact matches). */
  specificity: number;
  kind: GlossaryEntryKind;
}

/** A match produced by the English index. */
export interface EnIndexMatch {
  entryId: string;
  /** Raw text found in the document. */
  matched: string;
  /** Canonical alias text. */
  surface: string;
  start: number;
  end: number;
  /** `exact` = identical text, `variant` = case/hyphen/plural, `alias` = abbreviation. */
  layer: 'exact' | 'variant' | 'alias';
  aliasKind: GlossaryAliasKind;
}

/** Low specificity entries must match case exactly (design §2.5.3). */
const CASE_EXACT_SPECIFICITY = 0.5;

export class EnIndex {
  private readonly buckets = new Map<string, EnIndexEntry[]>();
  private size = 0;

  /** Register one surface form. */
  add(entry: EnIndexEntry): void {
    if (entry.lemmaTokens.length === 0) return;
    const first = entry.lemmaTokens[0];
    const bucket = this.buckets.get(first);
    if (bucket) bucket.push(entry);
    else this.buckets.set(first, [entry]);
    this.size++;
  }

  /** Number of registered surface forms. */
  get length(): number {
    return this.size;
  }

  /** Sort every bucket longest-first (call once after all `add` calls). */
  finalize(): void {
    for (const bucket of this.buckets.values()) {
      bucket.sort((a, b) => b.lemmaTokens.length - a.lemmaTokens.length);
    }
  }

  /** Scan `text` for entry / alias occurrences. */
  match(text: string, opts: { enableVariant?: boolean } = {}): EnIndexMatch[] {
    const enableVariant = opts.enableVariant ?? true;
    const tokens: EnToken[] = tokenizeEn(text);
    const matches: EnIndexMatch[] = [];

    let i = 0;
    while (i < tokens.length) {
      const bucket = this.buckets.get(tokens[i].lemma);
      if (!bucket) {
        i++;
        continue;
      }

      // Collect **every** entry anchored at this position. Scanning advances
      // one token at a time (not past the longest match) so a term nested in a
      // matched phrase is still found: "Do not disconnect … firmware update."
      // also yields the `Firmware update` term, which review and injection
      // both need.
      const found: EnIndexEntry[] = [];
      for (const entry of bucket) {
        const count = entry.lemmaTokens.length;
        if (i + count > tokens.length) continue;
        if (!matchesAt(tokens, i, entry.lemmaTokens)) continue;
        if (found.some((e) => e.entryId === entry.entryId)) continue;
        found.push(entry);
      }

      if (found.length === 0) {
        i++;
        continue;
      }

      for (const entry of found) {
        const start = tokens[i].start;
        const end = tokens[i + entry.lemmaTokens.length - 1].end;
        const matched = text.slice(start, end);
        const layer = classifyLayer(matched, entry);
        if (layer === null) continue; // low-specificity entry with wrong casing
        if (!enableVariant && layer !== 'exact') continue;
        matches.push({
          entryId: entry.entryId,
          matched,
          surface: entry.surface,
          start,
          end,
          layer,
          aliasKind: entry.aliasKind,
        });
      }

      i++;
    }

    return matches;
  }
}

/** Compare the token lemmas at `offset` with the entry token list. */
function matchesAt(tokens: EnToken[], offset: number, expected: string[]): boolean {
  for (let j = 0; j < expected.length; j++) {
    if (tokens[offset + j].lemma !== expected[j]) return false;
  }
  return true;
}

/**
 * Classify a hit as exact / variant / alias.
 * Returns `null` when a low-specificity entry matched with different casing.
 */
function classifyLayer(
  matched: string,
  entry: EnIndexEntry
): 'exact' | 'variant' | 'alias' | null {
  const sameText = matched === entry.surface;
  if (entry.specificity < CASE_EXACT_SPECIFICITY && !sameText) return null;
  if (entry.aliasKind === 'abbr' || entry.aliasKind === 'variant') return 'alias';
  return sameText ? 'exact' : 'variant';
}

/** Build an `EnIndex` from entry rows (entry text + expanded en aliases). */
export function buildEnIndex(
  rows: {
    id: string;
    kind: GlossaryEntryKind;
    specificity: number;
    aliases: { alias: string; kind: GlossaryAliasKind }[];
  }[]
): EnIndex {
  const index = new EnIndex();
  for (const row of rows) {
    for (const alias of row.aliases) {
      const lemmaTokens = lemmaKey(alias.alias).split(' ').filter(Boolean);
      if (lemmaTokens.length === 0) continue;
      index.add({
        entryId: row.id,
        surface: alias.alias,
        lemmaTokens,
        aliasKind: alias.kind,
        specificity: row.specificity,
        kind: row.kind,
      });
    }
  }
  index.finalize();
  return index;
}
