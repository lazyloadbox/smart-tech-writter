// L1 Chinese index (design doc §2.5.4 / P2a-2).
//
// Chinese has no word boundaries, so exact matching uses an Aho-Corasick
// automaton over every zh-CN / zh-TW alias. Building 50k patterns is well
// under a second and scanning is linear in the text length, which keeps large
// DITA documents cheap to match.
//
// Overlapping hits are resolved longest-first: `占空比寄存器` wins over
// `占空比` when both start at the same position.

import type { GlossaryAliasKind } from '../aliases';

/** One registered Chinese pattern. */
export interface ZhPattern {
  entryId: string;
  surface: string;
  aliasKind: GlossaryAliasKind;
  /** Language the alias came from (`zh` for either script). */
  script: 'zh-CN' | 'zh-TW';
}

/** A match produced by the automaton. */
export interface ZhIndexMatch {
  entryId: string;
  matched: string;
  surface: string;
  start: number;
  end: number;
  layer: 'exact' | 'alias';
  aliasKind: GlossaryAliasKind;
  script: 'zh-CN' | 'zh-TW';
}

interface ZhNode {
  next: Map<string, number>;
  fail: number;
  out: ZhPattern[];
}

/** Direct child `<title>` style stack is not needed here — pure string scan. */
export class ZhAutomaton {
  private nodes: ZhNode[] = [{ next: new Map(), fail: 0, out: [] }];
  private built = false;
  private patternCount = 0;
  /** Maximum pattern length (characters) — lets `match` stop early. */
  private maxLength = 0;

  /** Add one pattern. Call `build()` once after all patterns are added. */
  add(pattern: string, entryId: string, aliasKind: GlossaryAliasKind, script: 'zh-CN' | 'zh-TW'): void {
    const text = pattern.trim();
    if (!text) return;
    if (this.built) throw new Error('ZhAutomaton: add() after build()');
    let node = 0;
    for (const ch of text) {
      const next = this.nodes[node].next.get(ch);
      if (next === undefined) {
        this.nodes.push({ next: new Map(), fail: 0, out: [] });
        const id = this.nodes.length - 1;
        this.nodes[node].next.set(ch, id);
        node = id;
      } else {
        node = next;
      }
    }
    this.nodes[node].out.push({ entryId, surface: text, aliasKind, script });
    this.patternCount++;
    this.maxLength = Math.max(this.maxLength, text.length);
  }

  /** Number of registered patterns. */
  get length(): number {
    return this.patternCount;
  }

  /** Build failure links (BFS). */
  build(): void {
    if (this.built) return;
    const queue: number[] = [];
    for (const child of this.nodes[0].next.values()) {
      this.nodes[child].fail = 0;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const [ch, child] of this.nodes[current].next) {
        // Follow failure links until a transition exists (or root).
        let fail = this.nodes[current].fail;
        while (fail !== 0 && !this.nodes[fail].next.has(ch)) {
          fail = this.nodes[fail].fail;
        }
        const target = this.nodes[fail].next.get(ch);
        this.nodes[child].fail = target !== undefined && target !== child ? target : 0;
        // Inherit outputs from the failure node (suffix matches).
        const inherited = this.nodes[this.nodes[child].fail].out;
        if (inherited.length > 0) this.nodes[child].out = this.nodes[child].out.concat(inherited);
        queue.push(child);
      }
    }
    this.built = true;
  }

  /** Scan `text`, returning longest non-contained matches. */
  match(text: string): ZhIndexMatch[] {
    if (!this.built) this.build();
    if (!text) return [];

    const found: ZhIndexMatch[] = [];
    let node = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      while (node !== 0 && !this.nodes[node].next.has(ch)) {
        node = this.nodes[node].fail;
      }
      const next = this.nodes[node].next.get(ch);
      node = next === undefined ? 0 : next;

      const out = this.nodes[node].out;
      if (out.length === 0) continue;

      for (const pattern of out) {
        const start = i - pattern.surface.length + 1;
        if (start < 0) continue;
        found.push({
          entryId: pattern.entryId,
          matched: pattern.surface,
          surface: pattern.surface,
          start,
          end: i + 1,
          layer: pattern.aliasKind === 'primary' ? 'exact' : 'alias',
          aliasKind: pattern.aliasKind,
          script: pattern.script,
        });
      }
    }

    return dropContainedMatches(found);
  }

  /** Longest pattern length, used by callers to bound scanning. */
  get longestPattern(): number {
    return this.maxLength;
  }
}

/**
 * Drop duplicate evidence only when the **same entry** matched twice and one
 * hit is contained in the other. Hits from different entries are kept: a
 * sentence can legitimately contain both `占空比` and `占空比寄存器`, and both
 * entries must be injected (otherwise recall drops and review misses terms).
 */
export function dropContainedMatches(matches: ZhIndexMatch[]): ZhIndexMatch[] {
  if (matches.length <= 1) return matches;
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: ZhIndexMatch[] = [];
  for (const candidate of sorted) {
    const covered = accepted.some(
      (kept) =>
        kept.entryId === candidate.entryId &&
        candidate.start >= kept.start &&
        candidate.end <= kept.end &&
        candidate.end - candidate.start < kept.end - kept.start
    );
    if (!covered) accepted.push(candidate);
  }
  return accepted;
}

/** Build a Chinese automaton from entry rows. */
export function buildZhAutomaton(
  rows: {
    id: string;
    zhCN: string;
    zhTW: string;
    aliases: { alias: string; kind: GlossaryAliasKind }[];
    /** Additional zh-TW aliases derived from zh-CN (opencc placeholder). */
    zhTWAliases?: string[];
  }[]
): ZhAutomaton {
  const automaton = new ZhAutomaton();
  for (const row of rows) {
    for (const alias of row.aliases) {
      automaton.add(alias.alias, row.id, alias.kind, 'zh-CN');
      // Fullwidth / NFKC variants of the same alias (e.g. `ＡＢＣ` → `ABC`).
      const normalized = alias.alias.normalize('NFKC');
      if (normalized !== alias.alias) {
        automaton.add(normalized, row.id, alias.kind, 'zh-CN');
      }
    }
    for (const alias of row.zhTWAliases ?? []) {
      automaton.add(alias, row.id, 'primary', 'zh-TW');
    }
  }
  automaton.build();
  return automaton;
}
