// Vector index for the local semantic layer (design §2.5.6.4 / P2b-4 / P4-7).
//
// Vectors are stored as one contiguous `Float32Array` (N × dims) and compared by
// dot product — identical to cosine similarity because the embedder L2-
// normalizes every vector. A 5k × 384 matrix answers 200 queries in well under
// 100 ms, which is far below the latency of the AI calls it supports.
//
// P4-7: past ~100k entries the brute-force scan becomes visible, so the index
// transparently upgrades to HNSW when the optional `hnswlib-node` dependency is
// installed. The dependency is **optional**: when it is missing (the default
// install) everything keeps working with the brute-force scan.

import { requireOptional } from '../embedding/backends/require-optional';

export interface VectorSearchHit {
  entryId: string;
  /** Cosine similarity in [-1, 1]. */
  score: number;
}

export interface VectorEntry {
  entryId: string;
  vector: Float32Array;
}

/** Above this many vectors the index tries to upgrade to HNSW. */
export const ANN_THRESHOLD = 100_000;

/** Minimal `hnswlib-node` surface we rely on (loaded lazily, optional). */
interface HnswIndex {
  initIndex(maxElements: number, efConstruction?: number): void;
  addPoint(point: number[] | Float32Array, label: number): void;
  searchKnn(point: number[] | Float32Array, k: number): { neighbors: number[]; distances: number[] };
  setEf?(ef: number): void;
}

interface HnswModule {
  HierarchicalNSW?: new (space: string, dims: number) => HnswIndex;
  default?: { HierarchicalNSW?: new (space: string, dims: number) => HnswIndex };
}

export class VectorIndex {
  private ids: string[] = [];
  private data: Float32Array = new Float32Array(0);
  private dims = 0;
  /** Lazily built HNSW index (only when the optional dependency is present). */
  private ann: HnswIndex | null = null;
  private annDisabled = false;

  get size(): number {
    return this.ids.length;
  }

  get dimensions(): number {
    return this.dims;
  }

  /** True when queries are accelerated by HNSW. */
  get usingAnn(): boolean {
    return this.ann !== null;
  }

  /** Raw id list (used by the snapshot writer). */
  getIds(): string[] {
    return this.ids.slice();
  }

  /** Raw matrix (used by the snapshot writer). */
  getData(): Float32Array {
    return this.data;
  }

  clear(): void {
    this.ids = [];
    this.data = new Float32Array(0);
    this.dims = 0;
    this.ann = null;
  }

  /** Append one vector; the first vector fixes the dimensionality. */
  add(entryId: string, vector: Float32Array): void {
    if (vector.length === 0) return;
    if (this.dims === 0) this.dims = vector.length;
    if (vector.length !== this.dims) {
      throw new Error(`vector dims mismatch: expected ${this.dims}, got ${vector.length}`);
    }
    const next = new Float32Array(this.data.length + this.dims);
    next.set(this.data, 0);
    next.set(vector, this.data.length);
    this.data = next;
    this.ids.push(entryId);
    if (this.ann) {
      try {
        this.ann.addPoint(vector, this.ids.length - 1);
      } catch {
        this.ann = null;
        this.annDisabled = true;
      }
    }
  }

  /** Replace the whole index in one shot (used after a full load). */
  build(entries: VectorEntry[]): void {
    this.clear();
    for (const entry of entries) this.add(entry.entryId, entry.vector);
  }

  /** Replace the content with a persisted snapshot (P4-7). */
  loadSnapshot(ids: string[], data: Float32Array, dims: number): boolean {
    if (dims <= 0 || ids.length * dims !== data.length) return false;
    this.ids = ids.slice();
    this.data = data;
    this.dims = dims;
    this.ann = null;
    return true;
  }

  /** Top-k most similar entries; `minScore` filters weak candidates. */
  topK(query: Float32Array, k: number, minScore = 0): VectorSearchHit[] {
    if (this.dims === 0 || query.length !== this.dims || k <= 0) return [];
    const ann = this.ensureAnn();
    if (ann) {
      try {
        const { neighbors, distances } = ann.searchKnn(query, Math.min(k, this.ids.length));
        const hits: VectorSearchHit[] = [];
        neighbors.forEach((row, index) => {
          const id = this.ids[row];
          if (!id) return;
          // HNSW 'cosine' space returns 1 - cosine similarity.
          const score = 1 - (distances[index] ?? 1);
          if (score >= minScore) hits.push({ entryId: id, score });
        });
        return hits.sort((a, b) => b.score - a.score).slice(0, k);
      } catch (err) {
        // HNSW must never break matching — fall back to the exact scan.
        void err;
        this.ann = null;
        this.annDisabled = true;
      }
    }

    const scores: VectorSearchHit[] = [];
    const n = this.ids.length;
    for (let row = 0; row < n; row++) {
      const base = row * this.dims;
      let dot = 0;
      for (let d = 0; d < this.dims; d++) dot += this.data[base + d] * query[d];
      if (dot >= minScore) scores.push({ entryId: this.ids[row], score: dot });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, k);
  }

  /** Has a vector for this entry? */
  has(entryId: string): boolean {
    return this.ids.includes(entryId);
  }

  /**
   * Build the HNSW index when it is worth it and the optional dependency is
   * available. Returns null whenever the brute-force scan should be used.
   */
  private ensureAnn(): HnswIndex | null {
    if (this.ann) return this.ann;
    if (this.annDisabled || this.ids.length < ANN_THRESHOLD || this.dims === 0) return null;
    try {
      const mod = requireOptional<HnswModule>('hnswlib-node');
      const Ctor = mod.HierarchicalNSW ?? mod.default?.HierarchicalNSW;
      if (!Ctor) throw new Error('hnswlib-node: HierarchicalNSW not found');
      const index = new Ctor('cosine', this.dims);
      index.initIndex(this.ids.length);
      index.setEf?.(64);
      for (let row = 0; row < this.ids.length; row++) {
        const base = row * this.dims;
        index.addPoint(this.data.subarray(base, base + this.dims), row);
      }
      this.ann = index;
      return this.ann;
    } catch (err) {
      // Optional dependency missing (default install) — stay on brute force.
      void err;
      this.annDisabled = true;
      return null;
    }
  }
}
