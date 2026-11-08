// L5b glossary adjudicator (design §2.5.7 / P2c-3).
//
// Gray-zone candidates — semantic similarity just below the injection
// threshold, one-to-many Chinese mappings, low-specificity variants — are sent
// in small batches to the main model, which decides whether the candidate
// really refers to one of the offered entries. Only gray-zone candidates are
// processed, so the token cost stays at 1–3 calls per run.

import log from 'electron-log';
import { BaseAgent } from './base.agent';
import { PROMPTS, buildGlossaryAdjudicatorUserPrompt } from '../prompts';
import { glossaryAdjudicationContract } from '../ai-providers/output-contracts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type {
  GlossaryAdjudicationCandidate,
  GlossaryAdjudicationResult,
} from '../../../shared/types/glossary.types';

/** Candidates per adjudication call (design §2.5.7). */
const BATCH_SIZE = 50;

export class GlossaryAdjudicatorAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.glossaryAdjudicator);
  }

  /** Adjudication is a helper, not a workflow stage. */
  async execute(_state: DocGenState): Promise<Partial<DocGenState>> {
    return {};
  }

  /**
   * Adjudicate gray-zone candidates. Failures are logged and treated as
   * "not confirmed" so the workflow continues with literal + semantic hits.
   */
  async adjudicate(candidates: GlossaryAdjudicationCandidate[]): Promise<GlossaryAdjudicationResult[]> {
    if (candidates.length === 0) return [];
    const results: GlossaryAdjudicationResult[] = [];

    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + BATCH_SIZE);
      try {
        const verdicts = await this.callStructuredLLM(
          buildGlossaryAdjudicatorUserPrompt(batch),
          glossaryAdjudicationContract,
          { signal: this.config.signal }
        );
        results.push(...sanitizeVerdicts(batch, verdicts));
      } catch (err) {
        log.warn('[Glossary][L5b] adjudication batch failed:', err);
      }
    }
    return results;
  }
}

/**
 * Drop verdicts that point at an entry id which was not offered for that
 * candidate — models occasionally confuse candidates when several look alike.
 */
export function sanitizeVerdicts(
  candidates: GlossaryAdjudicationCandidate[],
  verdicts: GlossaryAdjudicationResult[]
): GlossaryAdjudicationResult[] {
  const allowed = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const output: GlossaryAdjudicationResult[] = [];
  for (const verdict of verdicts) {
    const candidate = allowed.get(verdict.candidateId);
    if (!candidate) continue;
    if (verdict.entryId && !candidate.options.some((option) => option.entryId === verdict.entryId)) {
      output.push({ ...verdict, entryId: null });
      continue;
    }
    output.push(verdict);
  }
  return output;
}
