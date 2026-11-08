// Resolver: fuses raw evidence into scored, tiered glossary hits
// (design §2.5.8 / P2a-4).
//
// The semantic (L4) and AI (L5) layers are wired as optional hooks but are not
// implemented in P2a; when they arrive they only need to append evidence in the
// same `{ layer, similarity }` shape.

import type {
  GlossaryEntryView,
  GlossaryHit,
  GlossaryLayer,
  GlossaryLayerCounts,
  GlossaryMatchScenario,
  GlossaryResolveResult,
  GlossarySettings,
} from '../../../shared/types/glossary.types';
import type { GlossaryIndex, GlossaryMatch, GlossaryScanOptions } from './index/glossary-index';

/** Evidence weights (design §2.5.8). */
export const LAYER_WEIGHTS: Record<GlossaryLayer, number> = {
  exact: 1.0,
  variant: 0.95,
  alias: 0.92,
  fuzzy: 0.9,
  semantic: 0.9,
  ai: 0.95,
};

/** Low specificity entries are down-weighted to suppress noise. */
const LOW_SPECIFICITY_FACTOR = 0.7;
const LOW_SPECIFICITY_THRESHOLD = 0.5;
/** Number of source snippets kept per hit. */
const MAX_SAMPLES = 2;
/** Characters of context kept around a match. */
const CONTEXT_CHARS = 32;

export interface ResolveGlossaryOptions extends GlossaryScanOptions {
  scenario: GlossaryMatchScenario;
  settings: GlossarySettings;
  /** Additional evidence supplied by L4/L5 (P2b/P2c). */
  extraEvidence?: { entryId: string; layer: GlossaryLayer; similarity: number }[];
}

/** Empty per-layer counter. */
export function emptyLayerCounts(): GlossaryLayerCounts {
  return { exact: 0, variant: 0, alias: 0, fuzzy: 0, semantic: 0, ai: 0 };
}

/**
 * Fuse raw matches (plus optional extra evidence) into tiered hits.
 * Exported separately so it can be unit-tested without an index.
 */
export function fuseGlossaryMatches(
  matches: GlossaryMatch[],
  lookup: (entryId: string) => GlossaryEntryView | undefined,
  settings: GlossarySettings,
  extraEvidence: ResolveGlossaryOptions['extraEvidence'] = []
): { hits: GlossaryHit[]; candidateCount: number } {
  interface Accumulator {
    entryId: string;
    score: number;
    hits: number;
    layers: Set<GlossaryLayer>;
    samples: { surface: string; context: string }[];
    specificity: number;
  }

  const accumulators = new Map<string, Accumulator>();

  const ensure = (entryId: string): Accumulator => {
    const existing = accumulators.get(entryId);
    if (existing) return existing;
    const entry = lookup(entryId);
    const created: Accumulator = {
      entryId,
      score: 0,
      hits: 0,
      layers: new Set(),
      samples: [],
      specificity: entry?.specificity ?? 0.8,
    };
    accumulators.set(entryId, created);
    return created;
  };

  for (const match of matches) {
    const acc = ensure(match.entryId);
    const weight = LAYER_WEIGHTS[match.layer] ?? 0.9;
    acc.score = Math.max(acc.score, weight * match.similarity);
    acc.hits += 1;
    acc.layers.add(match.layer);
    if (acc.samples.length < MAX_SAMPLES) {
      const context =
        match.layer === 'fuzzy'
          ? match.surface
          : extractContext(match.surface);
      acc.samples.push({ surface: match.surface, context });
    }
  }

  for (const evidence of extraEvidence) {
    const acc = ensure(evidence.entryId);
    const weight = LAYER_WEIGHTS[evidence.layer] ?? 0.9;
    acc.score = Math.max(acc.score, weight * evidence.similarity);
    acc.hits += 1;
    acc.layers.add(evidence.layer);
  }

  const candidateCount = accumulators.size;
  const hits: GlossaryHit[] = [];

  for (const acc of accumulators.values()) {
    const specificity = acc.specificity;
    const rawScore = acc.score;
    const lowSpecificity = specificity < LOW_SPECIFICITY_THRESHOLD;
    const score = lowSpecificity ? rawScore * LOW_SPECIFICITY_FACTOR : rawScore;

    // Low-specificity entries (`Power`, `Input`) must never be "MUST use",
    // but a genuine case-exact match still deserves a Tier B reference slot,
    // so their tier floor uses the un-scaled score.
    let tier: 'A' | 'B' | null;
    if (lowSpecificity) {
      tier = rawScore >= settings.thresholds.tierB ? 'B' : null;
    } else {
      tier =
        score >= settings.thresholds.tierA
          ? 'A'
          : score >= settings.thresholds.tierB
            ? 'B'
            : null;
    }
    if (!tier) continue;

    hits.push({
      entryId: acc.entryId,
      tier,
      score: Number(score.toFixed(4)),
      layers: [...acc.layers],
      hits: acc.hits,
      samples: acc.samples,
    });
  }

  hits.sort((a, b) => priority(b, lookup) - priority(a, lookup));
  return { hits, candidateCount };
}

/**
 * Injection order: `score × (1 + log2(1 + hits)) × specificity`
 * (design §2.5.8). Tier A with many occurrences and high specificity wins.
 */
export function priority(hit: GlossaryHit, lookup: (entryId: string) => GlossaryEntryView | undefined): number {
  const specificity = lookup(hit.entryId)?.specificity ?? 0.8;
  return hit.score * (1 + Math.log2(1 + hit.hits)) * specificity;
}

/** Trim and collapse a matched surface into a short context snippet. */
function extractContext(surface: string): string {
  const text = surface.replace(/\s+/g, ' ').trim();
  if (text.length <= CONTEXT_CHARS) return text;
  return `${text.slice(0, CONTEXT_CHARS)}…`;
}

/** Scan `text` and resolve it into tiered hits. */
export function resolveGlossary(
  index: GlossaryIndex,
  text: string,
  options: ResolveGlossaryOptions
): GlossaryResolveResult {
  const startedAt = Date.now();
  const matches = index.match(text, options);
  const { hits, candidateCount } = fuseGlossaryMatches(
    matches,
    (id) => index.getEntry(id),
    options.settings,
    options.extraEvidence
  );

  const layers = emptyLayerCounts();
  for (const match of matches) layers[match.layer] += 1;
  for (const evidence of options.extraEvidence ?? []) layers[evidence.layer] += 1;

  return {
    hits,
    matchCount: matches.length,
    candidateCount,
    layers,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Format the workflow-log summary line (design §2.5.13). */
export function formatResolveLog(result: GlossaryResolveResult, version: number, tokens: number, truncated: number): string {
  const a = result.hits.filter((h) => h.tier === 'A').length;
  const b = result.hits.length - a;
  const semantic = result.layers.semantic > 0 ? ` · semantic ${result.layers.semantic}` : '';
  const ai = result.layers.ai > 0 ? ` · ai ${result.layers.ai}` : '';
  return `📚 Glossary v${version}: A=${a} B=${b} (${result.layers.exact} exact · ${result.layers.variant} variant · ${result.layers.alias} alias · ${result.layers.fuzzy} fuzzy${semantic}${ai}) · ${(tokens / 1000).toFixed(1)}k tokens · truncated ${truncated}`;
}
