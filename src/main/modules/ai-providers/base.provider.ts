export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** AbortSignal to cancel an in-flight request (pause / go-back). */
  signal?: AbortSignal;
  /** Optional provider-level structured output contract. */
  responseFormat?: ResponseFormat;
  /** Optional reasoning budget. Unsupported models must receive no field. */
  reasoningEffort?: ReasoningEffort;
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };

export type AIStreamChunkType = 'thinking' | 'content';

/**
 * A single streamed delta. Reasoning models (DeepSeek thinking variants, etc.)
 * emit `reasoning_content` deltas BEFORE the visible `content`; distinguishing
 * the two lets the UI surface the thinking phase live instead of showing a
 * blank spinner while the model "thinks".
 */
export interface AIStreamChunk {
  type: AIStreamChunkType;
  text: string;
}

export interface AIProvider {
  readonly providerName: string;
  complete(messages: AIMessage[], options?: CompletionOptions): Promise<string>;
  /** Content-only stream (backward-compatible; delegates to streamDetailed). */
  stream(messages: AIMessage[], options?: CompletionOptions): AsyncIterable<string>;
  /** Stream with reasoning deltas distinguished from visible output. */
  streamDetailed(messages: AIMessage[], options?: CompletionOptions): AsyncIterable<AIStreamChunk>;
  embed(text: string): Promise<number[]>;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  /**
   * Optional stable conversation id. Only used by providers that need it for
   * routing / prompt caching (currently the OpenCode `x-opencode-session`
   * header); ignored by everything else.
   */
  sessionId?: string;
}

export type ProviderType = 'openai' | 'anthropic' | 'ollama';
