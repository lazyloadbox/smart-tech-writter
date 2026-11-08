// Alias expansion + specificity scoring for the glossary matching engine
// (design doc §2.5.3 / P2a-1).
//
// The glossary stores a single English column, but real terminology tables
// contain several spellings of the same concept:
//
//   Pulse Width Modulation (PWM)      → primary + abbreviation
//   Reset / Restore                   → two alternatives
//   on-chip                           → on chip / onchip
//   占空比（占空系数）                  → two Chinese aliases
//
// Expanding them at index time keeps query-time matching cheap and lets the
// L1/L2 layers find every accepted spelling.

import { cleanCellText, countWords, normalizeEn, normalizeZh } from './normalize';
import type { GlossaryEntryKind } from '../../../shared/types/mapping.types';

/** How an alias relates to the canonical entry text. */
export type GlossaryAliasKind = 'primary' | 'abbr' | 'variant';

/** One expanded alias. */
export interface GlossaryAlias {
  /** Display form, trimmed to a single space. */
  alias: string;
  /** Normalized key used for dedupe and lookups. */
  aliasKey: string;
  kind: GlossaryAliasKind;
}

/** Expanded aliases for both language sides of one entry. */
export interface GlossaryAliasBundle {
  en: GlossaryAlias[];
  zh: GlossaryAlias[];
}

/** Separators that introduce an alternative spelling in the English column. */
const EN_PART_SEPARATOR = /\s*(?:\/|;|\||\b(?:also|or)\b)\s*|,\s*also\s+/i;
/** Bracket pairs (half- and full-width) for abbreviations / synonyms. */
const BRACKET_RE = /[（(]([^（()）]+)[)）]/g;

/** Normalized alias key (English: `normalizeEn`; Chinese: `normalizeZh`). */
export function normalizeAliasKey(value: string, lang: 'en' | 'zh'): string {
  return lang === 'en' ? normalizeEn(value) : normalizeZh(value);
}

/** Collapse internal whitespace and trim (keeps original case). */
function tidy(value: string): string {
  return cleanCellText(value).replace(/\s+/g, ' ').trim();
}

/** Decide whether a candidate looks like an abbreviation rather than a term. */
function looksLikeAbbreviation(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  if (letters.length <= 8 && letters === letters.toUpperCase()) return true;
  // `PWM` / `E5` style: short token with no lowercase letters at all.
  return value.length <= 6 && !/[a-z]/.test(value);
}

/** True when `value` contains at least one letter or CJK character. */
function hasContent(value: string): boolean {
  return /[A-Za-z0-9\u3400-\u9fff]/.test(value);
}

/** Split the English column into alternative spellings. */
function splitEnglishParts(en: string): string[] {
  return tidy(en)
    .split(EN_PART_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Expand one English value into aliases.
 *
 * - parentheses yield both the outer term and the inner alternative(s)
 * - `/`, `;`, `|`, ` or `, `, also ` split alternatives
 * - hyphenated terms also produce space-joined and joined variants
 */
export function expandEnAliases(en: string): GlossaryAlias[] {
  const out: GlossaryAlias[] = [];
  const seen = new Set<string>();

  const push = (raw: string, kind: GlossaryAliasKind): void => {
    const alias = tidy(raw);
    if (!alias || !hasContent(alias)) return;
    const aliasKey = normalizeAliasKey(alias, 'en');
    if (!aliasKey || seen.has(aliasKey)) return;
    seen.add(aliasKey);
    out.push({ alias, aliasKey, kind });
  };

  const pushWithVariants = (raw: string, kind: GlossaryAliasKind): void => {
    push(raw, kind);
    if (!raw.includes('-')) return;
    push(raw.replace(/-/g, ' '), 'variant');
    push(raw.replace(/-/g, ''), 'variant');
  };

  for (const part of splitEnglishParts(en)) {
    // Inner bracket content becomes an additional alias (`Pulse Width Modulation (PWM)`).
    const inner: string[] = [];
    const outer = part.replace(BRACKET_RE, (_match, content: string) => {
      inner.push(content);
      return ' ';
    });

    const outerText = tidy(outer);
    if (outerText) pushWithVariants(outerText, looksLikeAbbreviation(outerText) ? 'abbr' : 'primary');
    for (const content of inner) {
      const text = tidy(content);
      if (text) pushWithVariants(text, looksLikeAbbreviation(text) ? 'abbr' : 'primary');
    }
    // Abbreviation ↔ full form (design §2.5.2 L2): `Pulse Width Modulation` → `PWM`.
    // Only for 3+ word terms so `Duty cycle` does not generate `DC`.
    const acronym = acronymOf(outerText);
    if (acronym) push(acronym, 'abbr');
  }

  // Entries that only consist of brackets (`(PWM)`) still produce one alias.
  if (out.length === 0) push(tidy(en), 'primary');
  return out;
}

/** Initials of a 3+ word English term (`Pulse Width Modulation` → `PWM`). */
function acronymOf(text: string): string | null {
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length < 3) return null;
  const letters = words.map((word) => (word.match(/[A-Za-z]/) ?? [''])[0]).join('');
  if (letters.length < 2 || letters.length > 6) return null;
  return letters.toUpperCase();
}

/** Separators that introduce a Chinese synonym. */
const ZH_PART_SEPARATOR = /[、/;;；,，]/;

/**
 * Expand one Chinese value into aliases.
 * `占空比（占空系数）` → `占空比`, `占空系数`.
 */
export function expandZhAliases(text: string): GlossaryAlias[] {
  const out: GlossaryAlias[] = [];
  const seen = new Set<string>();

  const push = (raw: string): void => {
    const alias = tidy(raw);
    if (!alias || !hasContent(alias)) return;
    const aliasKey = normalizeAliasKey(alias, 'zh');
    if (!aliasKey || seen.has(aliasKey)) return;
    seen.add(aliasKey);
    out.push({ alias, aliasKey, kind: 'primary' });
  };

  for (const source of splitZhParts(text)) push(source);
  return out;
}

/** Split a Chinese value into candidate synonyms (brackets + separators). */
function splitZhParts(text: string): string[] {
  const value = tidy(text);
  if (!value) return [];
  const parts: string[] = [];
  const outer = value.replace(BRACKET_RE, (_match, content: string) => {
    parts.push(content);
    return ' ';
  });
  parts.push(outer);
  return parts
    .flatMap((part) => part.split(ZH_PART_SEPARATOR))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Expand both language sides of a glossary entry. */
export function expandAliases(entry: { en: string; zhCN?: string; zhTW?: string }): GlossaryAliasBundle {
  const zhSource = [entry.zhCN ?? '', entry.zhTW ?? '']
    .map((value) => tidy(value))
    .filter((value) => value.length > 0)
    .join('、');
  return {
    en: expandEnAliases(entry.en),
    zh: expandZhAliases(zhSource),
  };
}

// ── Specificity ─────────────────────────────────────────────────────────────

/**
 * Very common English words. Single-word glossary entries made only of these
 * are "low specificity": they cause noise (`Power`, `Input`, `Yes`) and only
 * match case-exactly (design §2.5.3 step 3).
 *
 * Domain terms (`reset`, `clock`, `timer`, `signal`, `register`, …) are
 * deliberately **not** listed — they are legitimate glossary entries even when
 * they are single short words.
 */
const COMMON_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
  'all', 'any', 'some', 'each', 'every', 'both', 'no', 'not', 'yes', 'on', 'off',
  'in', 'out', 'up', 'down', 'above', 'below', 'over', 'under', 'left', 'right',
  'top', 'bottom', 'front', 'back', 'before', 'after', 'first', 'last', 'next',
  'new', 'old', 'good', 'bad', 'high', 'low', 'fast', 'slow', 'big', 'small',
  'open', 'close', 'start', 'stop', 'run', 'set', 'get', 'put', 'add', 'remove',
  'read', 'write', 'use', 'used', 'make', 'made', 'do', 'does', 'done', 'go',
  'one', 'two', 'three', 'four', 'five', 'zero', 'many', 'more', 'most', 'less',
  'number', 'count', 'value', 'data', 'type', 'name', 'size', 'level', 'state',
  'mode', 'step', 'item', 'list', 'input', 'output', 'power',
]);

/** True when a single-word entry is one of the very common English words. */
export function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(normalizeEn(word));
}

/**
 * Specificity score in `(0, 1]` (design §2.5.3 step 3).
 *
 * - single common word → 0.35 (low; L1 requires case-exact matches)
 * - single word         → 0.6
 * - 2–3 words           → 0.85
 * - longer phrase       → 0.9
 * - abbreviation/digit  → 0.95
 */
export function computeSpecificity(entry: { en: string; kind?: GlossaryEntryKind }): number {
  const text = tidy(entry.en);
  if (!text) return 0.5;
  const words = countWords(text);
  if (words <= 1) {
    if (isCommonWord(text)) return 0.35;
    return looksLikeAbbreviation(text) ? 0.95 : 0.6;
  }
  if (/\d/.test(text)) return 0.95;
  if (words <= 3) return 0.85;
  return 0.9;
}

/** Specificity below this value counts as "low" (case-exact L1 only). */
export const LOW_SPECIFICITY_THRESHOLD = 0.5;
