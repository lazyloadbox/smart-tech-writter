import { describe, expect, it } from 'vitest';
import { VectorIndex } from '../../src/main/modules/glossary/index/vector-index';
import { SemanticCapability } from '../../src/main/modules/glossary/embedding/semantic-capability';
import { ModelError } from '../../src/main/modules/glossary/embedding/backends/types';
import { mergeGlossarySettings, type GlossarySettings } from '../../src/shared/types/glossary.types';
import type { ModelManager } from '../../src/main/modules/glossary/embedding/model-manager';
import type { LocalEmbedder } from '../../src/main/modules/glossary/embedding/local-embedder';

function unit(...values: number[]): Float32Array {
  const vector = new Float32Array(values);
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

describe('VectorIndex', () => {
  it('returns the closest vectors first (cosine = dot for normalized input)', () => {
    const index = new VectorIndex();
    index.add('duty', unit(1, 0, 0));
    index.add('power', unit(0, 1, 0));
    index.add('near-duty', unit(0.9, 0.1, 0));

    const hits = index.topK(unit(1, 0, 0), 2);
    expect(hits.map((hit) => hit.entryId)).toEqual(['duty', 'near-duty']);
    expect(hits[0].score).toBeCloseTo(1, 5);
  });

  it('filters candidates below minScore and tolerates empty indexes', () => {
    const index = new VectorIndex();
    expect(index.topK(unit(1, 0), 3)).toEqual([]);
    index.add('orthogonal', unit(0, 1));
    expect(index.topK(unit(1, 0), 3, 0.5)).toEqual([]);
  });

  it('rejects vectors of a different dimensionality', () => {
    const index = new VectorIndex();
    index.add('a', unit(1, 0));
    expect(() => index.add('b', unit(1, 0, 0))).toThrow(/dims mismatch/);
  });
});

describe('SemanticCapability', () => {
  const settings = mergeGlossarySettings({
    localEmbedding: { ...mergeGlossarySettings(null).localEmbedding, enabled: true },
  });

  function fakeManager(installed = true): { manager: ModelManager; marked: string[] } {
    const marked: string[] = [];
    const manager = {
      isInstalled: () => installed,
      getEmbedder: async () => ({ embed: async () => [unit(1, 0)] }) as unknown as LocalEmbedder,
      markDegraded: (reason: string) => marked.push(reason),
    } as unknown as ModelManager;
    return { manager, marked };
  }

  it('runs the operation when the model is available', async () => {
    const { manager } = fakeManager();
    const capability = new SemanticCapability(manager, () => settings);
    const result = await capability.withSemanticFallback(async () => 'ok', 'fallback');
    expect(result).toBe('ok');
    expect(capability.isAvailable()).toBe(true);
  });

  it('returns the fallback when the model is not installed', async () => {
    const { manager } = fakeManager(false);
    const capability = new SemanticCapability(manager, () => settings);
    expect(await capability.withSemanticFallback(async () => 'ok', 'fallback')).toBe('fallback');
  });

  it('trips the circuit breaker after two consecutive failures', async () => {
    const { manager, marked } = fakeManager();
    const capability = new SemanticCapability(manager, () => settings);
    const failing = async (): Promise<string> => {
      throw new ModelError('inference', 'boom');
    };
    expect(await capability.withSemanticFallback(failing, 'fallback')).toBe('fallback');
    expect(capability.isAvailable()).toBe(true);
    expect(await capability.withSemanticFallback(failing, 'fallback')).toBe('fallback');
    expect(capability.isAvailable()).toBe(false);
    expect(capability.isDegraded).toBe(true);
    expect(marked).toEqual(['boom']);

    capability.reset();
    expect(capability.isAvailable()).toBe(true);
  });

  it('is unavailable when the semantic layer is disabled', () => {
    const { manager } = fakeManager();
    const disabled: GlossarySettings = mergeGlossarySettings({
      layers: { variant: true, fuzzy: true, semantic: false, spellcheck: false },
      localEmbedding: { ...settings.localEmbedding, enabled: true },
    });
    const capability = new SemanticCapability(manager, () => disabled);
    expect(capability.isAvailable()).toBe(false);
    expect(capability.unavailableReason).toContain('semantic layer');
  });
});
