export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Assistant tool calls (only present on `assistant` messages). */
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  /** Associates a `tool` message with the call that produced it. */
  tool_call_id?: string;
  name?: string;
}

/** OpenAI-compatible tool (function) definition. */
export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** One tool call requested by the model. */
export interface AIToolCall {
  id: string;
  name: string;
  /** Raw JSON string of the arguments. */
  arguments: string;
}

/** Result of one tool-enabled completion round. */
export interface AIToolCallResult {
  content: string;
  toolCalls: AIToolCall[];
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
  /** Tool (function calling) definitions (P4-8). */
  tools?: AIToolDefinition[];
  toolChoice?: 'auto' | 'none';
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
  /**
   * Optional tool-enabled completion (P4-8). Providers that do not implement it
   * simply omit the method; callers fall back to the plain prompt path.
   */
  completeWithTools?(messages: AIMessage[], options?: CompletionOptions): Promise<AIToolCallResult>;
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
