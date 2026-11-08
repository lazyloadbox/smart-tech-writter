// Prompt block rendering for resolved glossary hits (design §2.5.9 / §2.6–2.8 /
// Appendix B / P2a-4).
//
// Rows are emitted as compact TSV because JSON / Markdown tables cost 30–60 %
// more tokens per row. The block respects a token budget: Tier A terms first,
// then approved phrasing, then Tier B fallbacks.

import type {
  GlossaryEntryView,
  GlossaryHit,
  GlossaryMatchScenario,
} from '../../../shared/types/glossary.types';
import { applyBudget, estimateTokens, joinBudgetedSections, type BudgetedLine } from './budget';

export type GlossaryTargetLang = 'en' | 'zh-CN' | 'zh-TW';

export interface BuildGlossaryBlockInput {
  hits: GlossaryHit[];
  lookup: (entryId: string) => GlossaryEntryView | undefined;
  scenario: GlossaryMatchScenario;
  targetLang?: GlossaryTargetLang;
  budgetTokens: number;
}

export interface BuiltGlossaryBlock {
  text: string;
  includedIds: string[];
  truncated: number;
  tokens: number;
}

interface Row {
  source: string;
  target: string;
}

/** Pick the source → target pair for an entry in the requested direction. */
function pairFor(entry: GlossaryEntryView, targetLang?: GlossaryTargetLang): Row | null {
  if (targetLang === 'en') {
    const source = entry.zhCN || entry.zhTW;
    if (!source || !entry.en) return null;
    return { source, target: entry.en };
  }
  if (targetLang === 'zh-TW') {
    if (!entry.en) return null;
    if (entry.zhTW) return { source: entry.en, target: entry.zhTW };
    if (entry.zhCN) return { source: entry.en, target: `${entry.zhCN} (zh-CN reference)` };
    return null;
  }
  // zh-CN (and the writing/review display pair).
  if (!entry.en) return null;
  const target = entry.zhCN || entry.zhTW;
  if (!target) return null;
  return { source: entry.en, target };
}

function toLine(row: Row, tierPrefix = ''): BudgetedLine {
  return { text: `${tierPrefix}${row.source}\t${row.target}` };
}

function languageLabel(targetLang?: GlossaryTargetLang): string {
  return targetLang ?? 'zh-CN';
}

/** Section headings per scenario. */
function headings(
  scenario: GlossaryMatchScenario,
  targetLang: GlossaryTargetLang | undefined,
  tier: 'A' | 'B',
  phrase: boolean
): string {
  if (scenario === 'translation') {
    const arrow = targetLang === 'en' ? 'zh → en' : `en → ${languageLabel(targetLang)}`;
    if (phrase) {
      return tier === 'A'
        ? `## Approved Phrasing (${arrow}) — reuse the translation verbatim when a source sentence matches`
        : `## Related Phrasing (${arrow}) — reference only`;
    }
    return tier === 'A'
      ? `## Translation Glossary (${arrow}) — MUST use for matching source terms\nSource\tTarget`
      : `## Related Terminology (${arrow}) — use only if the meaning matches\nSource\tTarget`;
  }

  if (scenario === 'review') {
    if (phrase) {
      return tier === 'A'
        ? '## Approved Phrasing — check that matching sentences were reused'
        : '## Related Phrasing — reference only';
    }
    return tier === 'A'
      ? '## Terminology Glossary (check consistency)\nen-US\tzh-CN'
      : '## Related Terminology (check consistency only if the meaning matches)\nen-US\tzh-CN';
  }

  // writing
  if (phrase) {
    return tier === 'A'
      ? '## Approved Phrasing (en-US) — reuse when the meaning matches'
      : '## Related Phrasing (en-US) — reference only';
  }
  return tier === 'A'
    ? '## Approved Terminology (en-US) — MUST use\nWhen the source refers to any concept below, use the exact en-US wording.\nen-US\tzh-CN'
    : '## Related Terminology (en-US) — use only if the meaning matches\nen-US\tzh-CN';
}

/**
 * Render the glossary block for a scenario, respecting `budgetTokens`.
 * Degradation order matches design §2.5.9: Tier B is dropped before Tier A,
 * and Tier A phrasing before Tier A terms.
 */
export function buildGlossaryPromptBlock(input: BuildGlossaryBlockInput): BuiltGlossaryBlock {
  const rows: { tier: 'A' | 'B'; phrase: boolean; row: Row }[] = [];

  for (const hit of input.hits) {
    const entry = input.lookup(hit.entryId);
    if (!entry) continue;
    const pair = pairFor(entry, input.targetLang);
    if (!pair) continue;
    rows.push({ tier: hit.tier, phrase: entry.kind === 'phrase', row: pair });
  }

  if (rows.length === 0) {
    return { text: '', includedIds: [], truncated: 0, tokens: 0 };
  }

  const group = (tier: 'A' | 'B', phrase: boolean) =>
    rows.filter((r) => r.tier === tier && r.phrase === phrase);

  // Reserve room for the instruction footer so the whole block stays in budget.
  const rules = rulesFor(input.scenario);
  const budget = Math.max(0, input.budgetTokens - (rules ? estimateTokens(rules) : 0));
  const sections = [
    applyBudget(
      headings(input.scenario, input.targetLang, 'A', false),
      group('A', false).map((r) => toLine(r.row)),
      budget
    ),
    applyBudget(
      headings(input.scenario, input.targetLang, 'A', true),
      group('A', true).map((r) => toLine(r.row)),
      budget
    ),
    applyBudget(
      headings(input.scenario, input.targetLang, 'B', false),
      group('B', false).map((r) => toLine(r.row, '~ ')),
      budget
    ),
    applyBudget(
      headings(input.scenario, input.targetLang, 'B', true),
      group('B', true).map((r) => toLine(r.row, '~ ')),
      budget
    ),
  ];

  const merged = joinBudgetedSections(sections);
  if (!merged.text) {
    return { text: '', includedIds: [], truncated: merged.truncated, tokens: 0 };
  }

  const withRules = rules ? `${merged.text}\n${rules}` : merged.text;
  return {
    text: withRules,
    includedIds: merged.includedIds,
    truncated: merged.truncated,
    tokens: merged.tokens,
  };
}

/** Short instruction footer per scenario. */
function rulesFor(scenario: GlossaryMatchScenario): string {
  if (scenario === 'translation') {
    return 'Rules: translate matching source terms with the given target text; never alter XML tags, attributes, code, or link targets.';
  }
  if (scenario === 'review') {
    return 'For every deviation, return a comment with section = "Glossary", originalText = the exact deviating text, and suggestedText = the corrected text.';
  }
  return 'Rules: use the approved wording consistently, including capitalization; do not introduce glossary terms unrelated to the source material.';
}
