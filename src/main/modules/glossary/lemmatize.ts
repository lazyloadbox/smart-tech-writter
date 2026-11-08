// Lightweight English tokenizer + lemmatizer for the glossary matching engine
// (design doc §2.5.3 step 2 / P2a-1).
//
// Design goals:
// - **Deterministic and dependency free** — runs in vitest and in a worker.
// - **Conservative** — an over-eager lemma only causes cross-form false
//   positives, so the rules below deliberately skip short words, acronyms and
//   anything containing a digit.
// - **Offset preserving** — every token keeps its character range so matches
//   can be reported back with their original surface text.

/** One token of an English text. */
export interface EnToken {
  /** Original text (including case and hyphens). */
  raw: string;
  /** Lowercased, lemmatized form used for index lookups. */
  lemma: string;
  /** Character offset in the scanned text (inclusive). */
  start: number;
  /** Character offset in the scanned text (exclusive). */
  end: number;
}

/** Words whose lemma cannot be derived by suffix rules. */
const IRREGULAR_LEMMAS: Record<string, string> = {
  is: 'be',
  are: 'be',
  was: 'be',
  were: 'be',
  been: 'be',
  being: 'be',
  has: 'have',
  had: 'have',
  have: 'have',
  does: 'do',
  did: 'do',
  done: 'do',
  goes: 'go',
  went: 'go',
  gone: 'go',
  children: 'child',
  indices: 'index',
  matrices: 'matrix',
  vertices: 'vertex',
  analyses: 'analysis',
  bases: 'basis',
  criteria: 'criterion',
  data: 'data',
  series: 'series',
  species: 'species',
};

/** Words that must never be lemmatized (already base forms / acronyms). */
const KEEP_AS_IS = new Set(['status', 'bus', 'gas', 'less', 'this', 'his', 'its']);

/** True when the character can appear inside an English word token. */
function isWordChar(ch: string): boolean {
  // Hyphens are separators so `duty-cycle` and `duty cycle` share one token
  // sequence (L2 hyphen/space equivalence comes for free).
  return /[A-Za-z0-9_'’]/.test(ch);
}

/**
 * Split text into tokens.
 *
 * Apostrophes stay inside a token (`isn't`) but **hyphens are separators**, so
 * `duty-cycle`, `duty cycle` and `Duty Cycle` all produce the token sequence
 * `duty / cycle`. The L2 layer then treats the hyphenated surface as a variant
 * of the canonical spaced form. A `.` is only kept when surrounded by digits
 * (`v3.5`, `1.2`).
 */
export function tokenizeEn(text: string): EnToken[] {
  const source = text ?? '';
  const tokens: EnToken[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (!isWordChar(ch) && !(ch === '.' && /\d/.test(source[i - 1] ?? '') && /\d/.test(source[i + 1] ?? ''))) {
      i++;
      continue;
    }

    const start = i;
    let value = '';
    while (i < source.length) {
      const c = source[i];
      if (isWordChar(c)) {
        value += c;
        i++;
        continue;
      }
      if (c === '.' && /\d/.test(value[value.length - 1] ?? '') && /\d/.test(source[i + 1] ?? '')) {
        value += c;
        i++;
        continue;
      }
      break;
    }

    // Trim trailing separators (`word'`).
    const trimmed = value.replace(/['’]+$/, '');
    const end = start + trimmed.length;
    if (!trimmed) continue;
    tokens.push({ raw: trimmed, lemma: lemmatizeWord(trimmed), start, end });
  }

  return tokens;
}

/**
 * Lemmatize a single English word.
 *
 * Skipped (returned lowercased unchanged):
 * - all-uppercase tokens of length ≥ 2 (`PWM`, `LEDC`)
 * - tokens shorter than 4 characters (`use`, `adc`)
 * - tokens containing digits (`ESP32`)
 */
export function lemmatizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (!lower) return lower;

  const irregular = IRREGULAR_LEMMAS[lower];
  if (irregular) return irregular;
  if (KEEP_AS_IS.has(lower)) return lower;

  // Acronyms / short words / identifiers with digits stay unchanged.
  if (word.length >= 2 && word === word.toUpperCase() && /[A-Z]/.test(word)) return lower;
  if (lower.length <= 3) return lower;
  if (/\d/.test(lower)) return lower;

  // -ies → -y  (duties → duty); keep `series`-style words via IRREGULAR.
  if (lower.endsWith('ies') && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }

  // -ied → -y  (studied → study)
  if (lower.endsWith('ied') && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }

  // -sses / -ches / -shes / -xes / -zes → drop "es".
  if (/(?:ss|ch|sh|x|z)es$/.test(lower)) {
    return lower.slice(0, -2);
  }

  // Plain plural -s (but not -ss, -us, -is).
  if (lower.endsWith('s') && !/(?:ss|us|is)$/.test(lower)) {
    return lower.slice(0, -1);
  }

  // -ing / -ed → base form; undo doubled consonants (running → run).
  if (lower.endsWith('ing') && lower.length > 6) {
    return stripDoubledConsonant(lower.slice(0, -3));
  }
  if (lower.endsWith('ed') && lower.length > 4) {
    return stripDoubledConsonant(lower.slice(0, -2));
  }

  return lower;
}

/**
 * `runn` → `run`, `stopp` → `stop`.
 * Only a small consonant set is collapsed so legitimate `-ll` / `-ss` endings
 * (`called`, `processed`) are preserved.
 */
function stripDoubledConsonant(stem: string): string {
  if (stem.length < 3) return stem;
  const last = stem[stem.length - 1];
  const prev = stem[stem.length - 2];
  if (last === prev && /[bdgmnprt]/.test(last)) return stem.slice(0, -1);
  return stem;
}

/**
 * Normalized lookup key for a multi-word English surface form.
 * Tokens are lemmatized and joined by a single space.
 */
export function lemmaKey(text: string): string {
  return tokenizeEn(text)
    .map((t) => t.lemma)
    .join(' ');
}
