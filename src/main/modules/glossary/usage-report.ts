// Pre-export terminology usage report (P4-4).
//
// Answers "did the generated document actually use the approved wording?" for
// every entry that took part in this run. Purely deterministic (no tokens) and
// dependency free so it can be unit tested.
//
// For each entry we classify the document as:
//   used     the approved en-US wording appears verbatim
//   variant  only a case / hyphen / spacing variant appears
//   missing  neither appears
//
// Forbidden wordings ("Do not use", P4-6) are reported separately.

import type {
  GlossaryEntryView,
  GlossaryTier,
  GlossaryUsageReport,
  GlossaryUsageRow,
} from '../../../shared/types/glossary.types';
import { normalizeEn, normalizeZh } from './normalize';

export interface BuildUsageReportInput {
  /** Final document text (DITA XML or Markdown). */
  text: string;
  /** Entries to evaluate (usually the run's hits). */
  entries: GlossaryEntryView[];
  /** Tier of an entry in the current run (null for manual additions). */
  tierOf?: (entryId: string) => GlossaryTier | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count occurrences of a term, allowing any run of whitespace/hyphens between
 * its words (so `Duty  Cycle` and `duty-cycle` both count for `Duty cycle`).
 */
export function countOccurrences(text: string, term: string): number {
  const trimmed = term.trim();
  if (!trimmed) return 0;
  if (/[\u3400-\u9fff]/.test(trimmed)) {
    const hay = normalizeZh(text);
    const needle = normalizeZh(trimmed);
    if (!needle) return 0;
    let count = 0;
    let index = hay.indexOf(needle);
    while (index !== -1) {
      count++;
      index = hay.indexOf(needle, index + needle.length);
    }
    return count;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const body = words.map(escapeRegExp).join('[\\s\\-]+');
  const regex = new RegExp(`(^|[^A-Za-z0-9])${body}(?=[^A-Za-z0-9]|$)`, 'gi');
  return (text.match(regex) ?? []).length;
}

/** Exact approved-wording matches (case-sensitive, hyphen/space tolerant). */
function countExact(text: string, term: string): number {
  const trimmed = term.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const body = words.map(escapeRegExp).join('[\\s\\-]+');
  const regex = new RegExp(`(^|[^A-Za-z0-9])(${body})(?=[^A-Za-z0-9]|$)`, 'g');
  return (text.match(regex) ?? []).filter((match) => match.includes(trimmed)).length;
}

/** Collect the distinct surface variants (any case / hyphen / spacing form). */
function findVariantSurfaces(text: string, term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/).filter(Boolean);
  const body = words.map(escapeRegExp).join('[\\s\\-]+');
  const regex = new RegExp(`(^|[^A-Za-z0-9])(${body})(?=[^A-Za-z0-9]|$)`, 'gi');
  const variants = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const surface = match[2];
    if (surface && surface !== trimmed) variants.add(surface);
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return [...variants];
}

/** Build the usage report for one document. */
export function buildUsageReport(input: BuildUsageReportInput): GlossaryUsageReport {
  const text = input.text ?? '';
  const rows: GlossaryUsageRow[] = [];
  let used = 0;
  let variantOnly = 0;
  let missing = 0;
  let forbiddenCount = 0;

  for (const entry of input.entries) {
    if (!entry.en) continue;
    const occurrences = countExact(text, entry.en);
    const variants = occurrences > 0 ? [] : findVariantSurfaces(text, entry.en);
    const status = occurrences > 0 ? 'used' : variants.length > 0 ? 'variant' : 'missing';

    const forbidden: string[] = [];
    for (const wording of entry.doNotUse ?? []) {
      if (!wording.trim()) continue;
      if (countOccurrences(text, wording) > 0) forbidden.push(wording);
    }

    if (status === 'used') used++;
    else if (status === 'variant') variantOnly++;
    else missing++;
    if (forbidden.length > 0) forbiddenCount++;

    rows.push({
      entryId: entry.id,
      en: entry.en,
      zhCN: entry.zhCN,
      tier: input.tierOf?.(entry.id) ?? null,
      status,
      occurrences,
      variants,
      forbidden,
    });
  }

  // Missing entries first: they are the actionable ones for the user.
  const order: Record<GlossaryUsageRow['status'], number> = { missing: 0, variant: 1, used: 2 };
  rows.sort((a, b) => {
    const byStatus = order[a.status] - order[b.status];
    if (byStatus !== 0) return byStatus;
    return a.en.localeCompare(b.en);
  });

  return {
    total: rows.length,
    used,
    variantOnly,
    missing,
    forbidden: forbiddenCount,
    checkedChars: text.length,
    rows,
  };
}

/** Normalized key of a term, exported for tests. */
export function usageKey(term: string): string {
  return normalizeEn(term);
}
