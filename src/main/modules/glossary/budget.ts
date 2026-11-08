// Token budget helpers for glossary prompt blocks (design §2.5.9 / P2a-4).
//
// Token counts are **estimates** on purpose: pulling in a real tokenizer would
// add a large dependency for a number that only needs to be roughly right. The
// estimate uses `chars / 4` for Latin text and `1 token per character` for CJK,
// then applies a 10 % safety margin (design §2.5.9 step 1).

import type { GlossaryMatchScenario, GlossarySettings } from '../../../shared/types/glossary.types';

/** CJK characters (including punctuation ranges) count as ~1 token each. */
const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;

/** Fraction of the remaining context a glossary block may consume. */
const MAX_CONTEXT_SHARE = 0.15;
/** Safety margin applied to every estimate. */
const SAFETY_FACTOR = 1.1;

/** Rough token estimate for a prompt fragment. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(CJK_RE) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil((rest / 4 + cjk) * SAFETY_FACTOR);
}

/** Stage budget in tokens (from settings). */
export function glossaryBudgetFor(
  settings: GlossarySettings,
  scenario: GlossaryMatchScenario
): number {
  const stageBudget =
    scenario === 'writing'
      ? settings.budget.writer
      : scenario === 'translation'
        ? settings.budget.translateChunk
        : settings.budget.reviewChunk;
  const contextCap = Math.max(0, settings.modelContextTokens) * MAX_CONTEXT_SHARE;
  return Math.max(0, Math.floor(Math.min(stageBudget, contextCap)));
}

export interface BudgetedLine {
  /** Text appended when the line fits. */
  text: string;
  /** Optional id for reporting which entries were included. */
  id?: string;
}

export interface BudgetedBlock {
  text: string;
  includedIds: string[];
  /** Number of lines that did not fit. */
  truncated: number;
  tokens: number;
}

/**
 * Append lines to a block until the token budget is exhausted.
 * A single oversized line is dropped rather than cut mid-sentence, so the
 * prompt never contains a partial glossary row.
 */
export function applyBudget(
  heading: string,
  lines: BudgetedLine[],
  budgetTokens: number
): BudgetedBlock & { headingIncluded: boolean } {
  if (lines.length === 0) {
    return { text: '', includedIds: [], truncated: 0, tokens: 0, headingIncluded: false };
  }

  const headingTokens = estimateTokens(`${heading}\n`);
  if (headingTokens > budgetTokens) {
    return {
      text: '',
      includedIds: [],
      truncated: lines.length,
      tokens: 0,
      headingIncluded: false,
    };
  }

  const kept: string[] = [];
  const includedIds: string[] = [];
  let used = headingTokens;
  let truncated = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(`${line.text}\n`);
    if (used + lineTokens > budgetTokens) {
      truncated++;
      continue;
    }
    kept.push(line.text);
    used += lineTokens;
    if (line.id) includedIds.push(line.id);
  }

  if (kept.length === 0) {
    return { text: '', includedIds: [], truncated: lines.length, tokens: 0, headingIncluded: false };
  }

  return {
    text: [heading, ...kept].join('\n'),
    includedIds,
    truncated,
    tokens: used,
    headingIncluded: true,
  };
}

/** Concatenate budgeted sections, counting truncated rows across all of them. */
export function joinBudgetedSections(
  sections: (BudgetedBlock & { headingIncluded: boolean })[]
): BudgetedBlock {
  const parts = sections.filter((s) => s.text);
  return {
    text: parts.map((s) => s.text).join('\n\n'),
    includedIds: parts.flatMap((s) => s.includedIds),
    truncated: sections.reduce((sum, s) => sum + s.truncated, 0),
    tokens: parts.reduce((sum, s) => sum + s.tokens, 0),
  };
}
