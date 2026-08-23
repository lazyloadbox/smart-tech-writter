import type { AIProvider } from '../ai-providers/base.provider';
import type { DocGenState } from '../../../shared/types/workflow.types';

export interface AgentConfig {
  systemPromptTemplate?: string;
  /** Optional progress callback for long-running preprocessing (e.g. map-reduce). */
  onProgress?: (message: string) => void;
  /** AbortSignal to cancel in-flight LLM calls (pause / go-back). */
  signal?: AbortSignal;
}

export abstract class BaseAgent {
  private _streamCallback?: (chunk: string) => void;

  constructor(
    protected provider: AIProvider,
    protected config: AgentConfig = {}
  ) {}

  abstract get systemPrompt(): string;
  abstract execute(state: DocGenState): Promise<Partial<DocGenState>>;

  /** Enable streaming mode — callback invoked for each text delta from the AI */
  setStreamCallback(cb: (chunk: string) => void): void {
    this._streamCallback = cb;
  }

  /**
   * Call the LLM. If a stream callback has been set via setStreamCallback(),
   * uses the provider's stream() method and invokes the callback for each chunk.
   * An optional AbortSignal cancels the in-flight request (pause / go-back).
   */
  protected async callLLM(userPrompt: string, model?: string, signal?: AbortSignal): Promise<string> {
    const messages = [
      { role: 'system' as const, content: this.systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    if (this._streamCallback) {
      let full = '';
      for await (const chunk of this.provider.stream(messages, { model, signal: signal ?? this.config.signal })) {
        full += chunk;
        this._streamCallback(chunk);
      }
      return full;
    }

    return this.provider.complete(messages, { model, signal: signal ?? this.config.signal });
  }
}
