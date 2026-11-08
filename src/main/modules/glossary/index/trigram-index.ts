// L3 fuzzy matching (design doc §2.5.5 / P2a-2).
//
// Sentence-level "translation memory" matching for phrase entries:
//
//   score = 0.5 × Dice(trigram) + 0.5 × (1 − tokenLevenshtein / maxLength)
//
// Candidates come from a character-trigram inverted index so only plausible
// sentences are scored. A small SymSpell delete-index provides optional
// spell-check hints for the review layer (never used for injection).

import { cleanCellText } from '../normalize';

/** Normalize text for fuzzy comparison (NFKC, lowercase, collapsed spaces). */
export function normalizeForFuzzy(text: string): string {
  return cleanCellText(text).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Character trigrams with sentinel padding (word boundaries matter). */
export function toTrigrams(text: string): string[] {
  const value = ` ${normalizeForFuzzy(text)} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= value.length; i++) out.push(value.slice(i, i + 3));
  return out;
}

/** Sørensen–Dice coefficient over two trigram sets. */
export function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of small) if (large.has(gram)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Levenshtein distance between two token arrays. */
export function tokenLevenshtein(a: string[], b: string[]): number {
  const rows = a.length;
  const cols = b.length;
  if (rows === 0) return cols;
  if (cols === 0) return rows;

  let previous = new Array<number>(cols + 1);
  let current = new Array<number>(cols + 1);
  for (let j = 0; j <= cols; j++) previous[j] = j;

  for (let i = 1; i <= rows; i++) {
    current[0] = i;
    for (let j = 1; j <= cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[cols];
}

/** `1 − distance / maxLength` over the token arrays. */
export function tokenSimilarity(a: string[], b: string[]): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - tokenLevenshtein(a, b) / maxLen;
}

/** Tokenize for the edit-distance part (words for English, characters for CJK). */
function splitTokens(text: string): string[] {
  const value = normalizeForFuzzy(text);
  if (!value) return [];
  // CJK characters are compared individually; Latin words by whitespace.
  return value.match(/[\u3400-\u9fff]|[a-z0-9_.-]+/g) ?? [];
}

export interface FuzzyCandidate {
  entryId: string;
  score: number;
}

export class TrigramIndex {
  private readonly postings = new Map<string, Set<number>>();
  private readonly texts: string[] = [];
  private readonly ids: string[] = [];
  private readonly tokenCache: string[][] = [];

  /** Register a phrase. Only entries with `kind = 'phrase'` should be added. */
  add(entryId: string, text: string): void {
    const index = this.texts.length;
    this.texts.push(text);
    this.ids.push(entryId);
    this.tokenCache.push(splitTokens(text));
    for (const gram of toTrigrams(text)) {
      const bucket = this.postings.get(gram);
      if (bucket) bucket.add(index);
      else this.postings.set(gram, new Set([index]));
    }
  }

  get length(): number {
    return this.texts.length;
  }

  /** Return the best `topK` phrase candidates for `query`. */
  query(query: string, topK = 20): FuzzyCandidate[] {
    if (this.texts.length === 0) return [];
    const grams = new Set(toTrigrams(query));
    if (grams.size === 0) return [];

    const counts = new Map<number, number>();
    for (const gram of grams) {
      const bucket = this.postings.get(gram);
      if (!bucket) continue;
      for (const idx of bucket) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    if (counts.size === 0) return [];

    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60);

    const queryTokens = splitTokens(query);
    const scored: FuzzyCandidate[] = [];
    for (const [idx, shared] of top) {
      // Cheap pre-filter on shared trigram ratio before the edit distance.
      const dice = (2 * shared) / (grams.size + toTrigrams(this.texts[idx]).length || 1);
      if (dice < 0.3) continue;
      const score = 0.5 * diceSimilarity(grams, new Set(toTrigrams(this.texts[idx]))) +
        0.5 * tokenSimilarity(queryTokens, this.tokenCache[idx]);
      scored.push({ entryId: this.ids[idx], score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

/**
 * Minimal SymSpell-style delete index (edit distance 1).
 * Used only to *suggest* spelling fixes in review (design §2.5.5), never to
 * inject glossary entries into a prompt.
 */
export class SymSpellIndex {
  private readonly exact = new Map<string, string>();
  private readonly deletes = new Map<string, string[]>();

  add(word: string): void {
    const value = normalizeForFuzzy(word);
    if (value.length < 6) return;
    this.exact.set(value, value);
    for (const variant of generateDeletes(value)) {
      const bucket = this.deletes.get(variant);
      if (bucket) bucket.push(value);
      else this.deletes.set(variant, [value]);
    }
  }

  /** Return known words within edit distance 1 of `word`. */
  lookup(word: string, limit = 3): string[] {
    const value = normalizeForFuzzy(word);
    if (value.length < 6) return [];
    const out = new Set<string>();
    if (this.exact.has(value)) out.add(value);
    for (const variant of generateDeletes(value)) {
      for (const candidate of this.deletes.get(variant) ?? []) out.add(candidate);
      if (out.size >= limit) break;
    }
    // distance 1 requires removing exactly one char too.
    for (let i = 0; i < value.length; i++) {
      const candidate = value.slice(0, i) + value.slice(i + 1);
      if (this.exact.has(candidate)) out.add(candidate);
    }
    return [...out].slice(0, limit);
  }
}

/** All strings at delete-distance 1. */
function generateDeletes(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    out.push(word.slice(0, i) + word.slice(i + 1));
  }
  return out;
}
