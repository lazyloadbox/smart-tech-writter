import OpenAI from 'openai';
import type { AIProvider, AIMessage, CompletionOptions, ProviderConfig } from './base.provider';

export class OpenAIProvider implements AIProvider {
  readonly providerName = 'openai';
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    // Use a placeholder if apiKey is empty to prevent the SDK from throwing at
    // construction time; actual requests will fail with a clear auth error instead.
    this.client = new OpenAI({
      apiKey: config.apiKey || 'NOT_CONFIGURED',
      baseURL: config.baseURL || undefined,
    });
    this.defaultModel = config.defaultModel ?? 'gpt-4o';
  }

  async complete(messages: AIMessage[], options?: CompletionOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async *stream(messages: AIMessage[], options?: CompletionOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0]?.embedding ?? [];
  }
}
