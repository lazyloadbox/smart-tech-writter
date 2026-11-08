// Deterministic glossary checker (design §2.8.2 / P3-3).
//
// The rule layer is deterministic and free (no tokens). It guarantees that
// "the glossary has an entry, the document does not use it" is always
// reported, while the AI layer (reviewer prompt) is responsible for producing
// one-click `originalText → suggestedText` fixes for everything else.
//
// Rules implemented here:
//   R1  a zh-CN concept from the glossary appears in the source material but
//       its approved en-US wording is missing from the English draft
//   R2  the draft uses a case / hyphen / spacing variant of an entry
//       (`duty-cycle`, `Duty Cycle`) instead of the approved wording
//   R3  a source term was not translated with the approved target text
//   R4  a glossary sentence appears verbatim in the source but its approved
//       translation was not reused
//
// R5 (semantic paraphrase) and R6 (spelling) are intentionally out of scope
// for the deterministic layer.

import type { GlossaryEntryView, GlossaryHit } from '../../../shared/types/glossary.types';
import { normalizeEn, normalizeZh } from './normalize';

export type GlossaryCheckRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export interface TermIssue {
  rule: GlossaryCheckRule;
  entryId: string;
  sourceTerm: string;
  expected: string;
  explanation: string;
  severity: 'error' | 'warning' | 'suggestion' | 'info';
  /** Exact snippet the user can accept (R2/R5 only). */
  originalText?: string;
  suggestedText?: string;
}

export interface CheckTranslationTermsInput {
  sourceText: string;
  targetText: string;
  hits: GlossaryHit[];
  lookup: (entryId: string) => GlossaryEntryView | undefined;
  targetLang: 'en' | 'zh-CN' | 'zh-TW';
  /** Only report Tier A entries (design §2.8.2 noise threshold). Default true. */
  tierAOnly?: boolean;
  /** Maximum reported issues (protects the UI). Default 50. */
  maxIssues?: number;
}

/** True when `haystack` contains `needle` (case-insensitive for English). */
function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (/[\u3400-\u9fff]/.test(needle)) {
    return normalizeZh(haystack).includes(normalizeZh(needle));
  }
  return normalizeEn(haystack).includes(normalizeEn(needle));
}

/**
 * R3 — the source document contains a glossary entry, but the translation does
 * not contain the approved target text.
 */
export function checkTranslationTerms(input: CheckTranslationTermsInput): TermIssue[] {
  const issues: TermIssue[] = [];
  const maxIssues = input.maxIssues ?? 50;
  const tierAOnly = input.tierAOnly ?? true;

  for (const hit of input.hits) {
    if (tierAOnly && hit.tier !== 'A') continue;
    const entry = input.lookup(hit.entryId);
    if (!entry) continue;

    const sourceTerm = input.targetLang === 'en' ? entry.zhCN || entry.zhTW : entry.en;
    const expected =
      input.targetLang === 'en'
        ? entry.en
        : input.targetLang === 'zh-TW'
          ? entry.zhTW || entry.zhCN
          : entry.zhCN;
    if (!sourceTerm || !expected) continue;
    // Only report when the term really is present in the source document.
    if (!contains(input.sourceText, sourceTerm)) continue;
    if (contains(input.targetText, expected)) continue;

    issues.push({
      rule: 'R3',
      entryId: entry.id,
      sourceTerm,
      expected,
      severity: 'warning',
      explanation:
        input.targetLang === 'en'
          ? `The source contains "${sourceTerm}", which should be translated as "${expected}", but the translation does not contain it.`
          : `The source contains "${sourceTerm}", which should be translated as "${expected}", but the translation does not contain it.`,
    });
    if (issues.length >= maxIssues) break;
  }

  return issues;
}

/**
 * R4 — a glossary sentence (kind = phrase) appears verbatim in the source but
 * the translation does not reuse the approved target sentence.
 */
export function checkPhraseReuse(input: CheckTranslationTermsInput): TermIssue[] {
  const issues: TermIssue[] = [];
  const maxIssues = input.maxIssues ?? 50;
  const tierAOnly = input.tierAOnly ?? true;

  for (const hit of input.hits) {
    if (tierAOnly && hit.tier !== 'A') continue;
    const entry = input.lookup(hit.entryId);
    if (!entry || entry.kind !== 'phrase') continue;

    const sourceTerm = input.targetLang === 'en' ? entry.zhCN || entry.zhTW : entry.en;
    const expected =
      input.targetLang === 'en'
        ? entry.en
        : input.targetLang === 'zh-TW'
          ? entry.zhTW || entry.zhCN
          : entry.zhCN;
    if (!sourceTerm || !expected) continue;
    if (!contains(input.sourceText, sourceTerm)) continue;
    if (contains(input.targetText, expected)) continue;

    issues.push({
      rule: 'R4',
      entryId: entry.id,
      sourceTerm,
      expected,
      severity: 'info',
      explanation: `The source sentence "${sourceTerm}" matches an approved glossary sentence; the approved wording was not reused.`,
    });
    if (issues.length >= maxIssues) break;
  }

  return issues;
}

export interface CheckDraftTermsInput {
  /** The generated English draft (Markdown or DITA XML). */
  draftText: string;
  /** Source material the draft was generated from (ingest context + analysis). */
  sourceText: string;
  hits: GlossaryHit[];
  lookup: (entryId: string) => GlossaryEntryView | undefined;
  /** Only report Tier A entries. Default true. */
  tierAOnly?: boolean;
  maxIssues?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex that finds case / hyphen / spacing variants of an English
 * term. Words may be joined by any run of whitespace or hyphens, which is
 * exactly the family of "same term, different surface form" variants we want
 * R2 to normalise.
 */
function buildVariantRegex(term: string): RegExp | null {
  const words = term.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const body = words.map(escapeRegExp).join('[\\s\\-]+');
  // `(^|[^A-Za-z0-9])` / `(?=[^A-Za-z0-9]|$)` emulate word boundaries without
  // lookbehind so the captured snippet stays exact.
  return new RegExp(`(^|[^A-Za-z0-9])(${body})(?=[^A-Za-z0-9]|$)`, 'gi');
}

/** Find every surface variant of `term` inside `text` (excluding the exact form). */
function findVariants(text: string, term: string): string[] {
  const regex = buildVariantRegex(term);
  if (!regex) return [];
  const variants = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const surface = match[2];
    if (surface && surface !== term) variants.add(surface);
    // Prevent zero-length infinite loops; the regex always consumes >= 1 char.
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return [...variants];
}

/**
 * R1 + R2 — deterministic checks for an English draft.
 */
export function checkDraftTerms(input: CheckDraftTermsInput): TermIssue[] {
  const issues: TermIssue[] = [];
  const maxIssues = input.maxIssues ?? 60;
  const tierAOnly = input.tierAOnly ?? true;

  for (const hit of input.hits) {
    if (tierAOnly && hit.tier !== 'A') continue;
    const entry = input.lookup(hit.entryId);
    if (!entry || !entry.en) continue;

    // R2 — the draft uses a non-approved surface form of the term. This takes
    // precedence over R1: the concept *is* present, only the spelling differs,
    // so an actionable one-click suggestion is more useful than a warning.
    const variants = findVariants(input.draftText, entry.en);
    if (variants.length > 0) {
      for (const variant of variants) {
        issues.push({
          rule: 'R2',
          entryId: entry.id,
          sourceTerm: variant,
          expected: entry.en,
          severity: 'suggestion',
          originalText: variant,
          suggestedText: entry.en,
          explanation: `"${variant}" is a variant of the glossary term "${entry.en}". Use the approved capitalization and spacing.`,
        });
        if (issues.length >= maxIssues) break;
      }
      if (issues.length >= maxIssues) break;
      continue;
    }

    // R1 — Chinese concept present in source, approved en-US missing in draft.
    const zhSource = [entry.zhCN, entry.zhTW].filter(Boolean) as string[];
    const zhInSource = zhSource.some((zh) => contains(input.sourceText, zh));
    if (
      zhInSource &&
      entry.kind === 'term' &&
      (entry.specificity ?? 0) >= 0.5 &&
      !contains(input.draftText, entry.en)
    ) {
      issues.push({
        rule: 'R1',
        entryId: entry.id,
        sourceTerm: entry.zhCN || entry.zhTW,
        expected: entry.en,
        severity: 'warning',
        explanation: `The source material contains "${entry.zhCN || entry.zhTW}", which should use the approved wording "${entry.en}"; the draft does not contain it.`,
      });
      if (issues.length >= maxIssues) break;
    }
  }

  return issues;
}

export interface CheckForbiddenInput {
  /** The generated English draft (Markdown or DITA XML). */
  draftText: string;
  /** Every entry that carries a forbidden wording list. */
  entries: GlossaryEntryView[];
  /** Maximum reported issues. Default 50. */
  maxIssues?: number;
}

/**
 * R7 — the document uses a wording the glossary marks as "Do not use" (P4-6).
 *
 * Reported as a one-click suggestion (`originalText → approved wording`) so the
 * reviewer can fix it directly. Forbidden wordings never enter the matching
 * index, so this scan walks the explicit lists instead of the resolved hits.
 */
export function checkForbiddenTerms(input: CheckForbiddenInput): TermIssue[] {
  const issues: TermIssue[] = [];
  const maxIssues = input.maxIssues ?? 50;
  const seen = new Set<string>();

  for (const entry of input.entries) {
    const forbidden = entry.doNotUse ?? [];
    if (!entry.en || forbidden.length === 0) continue;
    for (const wording of forbidden) {
      const term = wording.trim();
      if (!term || term.toLowerCase() === entry.en.toLowerCase()) continue;
      const key = `${entry.id}|${term.toLowerCase()}`;
      if (seen.has(key)) continue;
      const variants = findVariants(input.draftText, term);
      // `findVariants` matches case/hyphen/space variants; also accept the
      // exact surface form.
      const surfaces = new Set(variants);
      if (contains(input.draftText, term)) surfaces.add(term);
      for (const surface of surfaces) {
        seen.add(key);
        issues.push({
          rule: 'R7',
          entryId: entry.id,
          sourceTerm: surface,
          expected: entry.en,
          severity: 'suggestion',
          originalText: surface,
          suggestedText: entry.en,
          explanation: `"${surface}" is marked as "Do not use" in the glossary; use the approved wording "${entry.en}".`,
        });
        if (issues.length >= maxIssues) return issues;
        break;
      }
    }
  }

  return issues;
}
