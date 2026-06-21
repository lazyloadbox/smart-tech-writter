export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  readonly providerName: string;
  complete(messages: AIMessage[], options?: CompletionOptions): Promise<string>;
  stream(messages: AIMessage[], options?: CompletionOptions): AsyncIterable<string>;
  embed(text: string): Promise<number[]>;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

export type ProviderType = 'openai' | 'anthropic' | 'ollama';
