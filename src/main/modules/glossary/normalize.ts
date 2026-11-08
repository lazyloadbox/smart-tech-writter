// Text normalization helpers shared by the glossary import pipeline (P1) and
// by the future matching engine (`en_key` dedupe key in the database).
//
// The rules mirror design doc §2.4.3:
//
//   normalizeEn(s) = NFKC → curly quotes → whitespace collapse → trim
//                    → strip trailing sentence punctuation → lowercase
//   normalizeZh(s) = NFKC → drop zero-width / NBSP → remove all whitespace
//
// They are intentionally dependency free so the module can be unit tested in
// plain Node (vitest) and reused from `database.ts` during migrations.

/** Zero-width characters that Excel exports occasionally inject. */
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
/** Non-breaking space (and narrow no-break space) → regular space. */
const NON_BREAKING_SPACE_RE = /[\u00A0\u202F]/g;

/**
 * Normalize the raw cell text before any further processing:
 * strip zero-width chars, convert non-breaking spaces to normal spaces and
 * trim the ends.
 */
export function cleanCellText(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(ZERO_WIDTH_RE, '')
    .replace(NON_BREAKING_SPACE_RE, ' ')
    .trim();
}

/** Normalize smart quotes so `“Reset”` and `"Reset"` share one key. */
function normalizeQuotes(value: string): string {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/**
 * Normalized English key used as the dedupe key (`translation_mappings.en_key`).
 *
 * `"Duty  Cycle."`, `"duty cycle"` and `"Duty cycle"` all map to `duty cycle`,
 * so whitespace-only / punctuation-only / case-only differences collapse into
 * a single glossary entry.
 */
export function normalizeEn(value: string | null | undefined): string {
  return normalizeQuotes(cleanCellText(value))
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。;；:：]+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Normalized Chinese text (used for equality checks when deduping).
 * NFKC unifies full-width letters/digits; every whitespace is removed because
 * Chinese terms never rely on spaces.
 */
export function normalizeZh(value: string | null | undefined): string {
  return cleanCellText(value).normalize('NFKC').replace(/\s+/g, '').trim();
}

/** Sentence-ending punctuation — a phrase ending with one is a `phrase`, never a `term`. */
const SENTENCE_END_RE = /[.!?。！？]$/;

/** Markdown/typographic punctuation that still counts as a sentence ending. */
const WORD_SPLIT_RE = /[\s\u3000]+/;

/**
 * Classify a glossary entry as a term or a phrase (design §2.3.1):
 * normalized English of at most six words that does not end with sentence
 * punctuation is a `term`; everything else is a `phrase` (sentence / wording).
 */
export function classifyEntryKind(en: string): 'term' | 'phrase' {
  const text = normalizeQuotes(cleanCellText(en)).normalize('NFKC').trim();
  if (!text || SENTENCE_END_RE.test(text)) return 'phrase';
  const words = text.split(WORD_SPLIT_RE).filter(Boolean);
  return words.length <= 6 ? 'term' : 'phrase';
}

/** Count English words (used by the UI / budgeter later on). */
export function countWords(value: string): number {
  const text = cleanCellText(value);
  if (!text) return 0;
  return text.split(WORD_SPLIT_RE).filter(Boolean).length;
}

// ── Forbidden wording list (P4-6 "Do not use" column) ──────────────────────

/**
 * Parse the stored forbidden wording list.
 *
 * Current format is a JSON string array; hand-written / legacy values fall back
 * to separator splitting so old data keeps working.
 */
export function parseDoNotUse(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => cleanCellText(String(item))).filter(Boolean);
    }
  } catch {
    // Not JSON — treat as separator-delimited text below.
  }
  return splitForbiddenText(value);
}

/** Split a free-form "do not use" cell/text into individual wordings. */
export function splitForbiddenText(value: string): string[] {
  const cleaned = cleanCellText(value);
  if (!cleaned) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of cleaned.split(/[\n;|、]+|\s+\/\s+/)) {
    const item = cleanCellText(part);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Serialize forbidden wordings for storage (empty list → empty string). */
export function serializeDoNotUse(list: string[] | undefined): string {
  const cleaned = (list ?? []).map((item) => cleanCellText(item)).filter(Boolean);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : '';
}
