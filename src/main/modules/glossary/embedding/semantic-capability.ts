// Semantic capability gate (design §2.5.6.7 / P2b-1a).
//
// A single place that answers "can I use the local embedding layer right now?"
// and wraps every vector call so a model/runtime failure can never propagate
// into a workflow. Two consecutive failures put the layer into `degraded` for
// the rest of the application session (circuit breaker).

import log from 'electron-log';
import { ModelError } from './backends/types';
import type { LocalEmbedder } from './local-embedder';
import type { ModelManager } from './model-manager';
import type { GlossarySettings } from '../../../../shared/types/glossary.types';

const MAX_CONSECUTIVE_FAILURES = 2;

export class SemanticCapability {
  private consecutiveFailures = 0;
  private degraded = false;
  private reason: string | undefined;
  private warned = false;

  constructor(
    private readonly manager: ModelManager,
    private readonly getSettings: () => GlossarySettings
  ) {}

  /** Cheap check: enabled, model installed and not in the degraded state. */
  isAvailable(): boolean {
    if (this.degraded) return false;
    const settings = this.getSettings();
    if (!settings.enabled || !settings.layers.semantic || !settings.localEmbedding.enabled) return false;
    return this.manager.isInstalled();
  }

  /** Human-readable reason the layer is unavailable (for logs / UI). */
  get unavailableReason(): string | undefined {
    if (this.degraded) return this.reason ?? 'semantic matching is degraded for this session';
    const settings = this.getSettings();
    if (!settings.localEmbedding.enabled) return 'local embedding is disabled';
    if (!settings.layers.semantic) return 'semantic layer is disabled';
    if (!this.manager.isInstalled()) return 'semantic model is not installed';
    return undefined;
  }

  /**
   * Run a vector operation with graceful degradation.
   *
   * Returns `fallback` when the layer is unavailable, the model cannot load, or
   * the operation throws. Logs once per session so the workflow log is not
   * spammed.
   */
  async withSemanticFallback<T>(
    fn: (embedder: LocalEmbedder) => Promise<T>,
    fallback: T
  ): Promise<T> {
    if (!this.isAvailable()) return fallback;
    let embedder: LocalEmbedder | null = null;
    try {
      embedder = await this.manager.getEmbedder();
      if (!embedder) return fallback;
      const result = await fn(embedder);
      this.consecutiveFailures = 0;
      return result;
    } catch (err) {
      this.recordFailure(err);
      return fallback;
    }
  }

  /** Record an inference failure and trip the breaker when it repeats. */
  recordFailure(err: unknown): void {
    this.consecutiveFailures += 1;
    const message = err instanceof Error ? err.message : String(err);
    log.warn('[Glossary][Semantic] operation failed', {
      consecutiveFailures: this.consecutiveFailures,
      error: message,
      reasonCode: err instanceof ModelError ? err.reason : undefined,
    });
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.degraded = true;
      this.reason = message;
      this.manager.markDegraded(message);
    }
    if (!this.warned) {
      this.warned = true;
      log.warn(
        `📚 Semantic matching unavailable (${message}); falling back to literal + AI matching for this stage`
      );
    }
  }

  /** Reset the breaker (manual retry from the settings page). */
  reset(): void {
    this.consecutiveFailures = 0;
    this.degraded = false;
    this.reason = undefined;
    this.warned = false;
  }

  get isDegraded(): boolean {
    return this.degraded;
  }
}
