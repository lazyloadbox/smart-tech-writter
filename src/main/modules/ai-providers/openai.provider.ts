import OpenAI from 'openai';
import log from 'electron-log';
import type { AIProvider, AIMessage, AIStreamChunk, CompletionOptions, ProviderConfig } from './base.provider';

/**
 * Default output token cap applied when a caller doesn't specify maxTokens.
 * Reasoning models (e.g. DeepSeek thinking variants) can spend their entire
 * output budget on reasoning_content and return an empty `content`; an explicit
 * cap gives the answer room to be emitted. Set to 128k to match the DeepSeek
 * V4 Flash 128K context window.
 */
export const DEFAULT_MAX_TOKENS = 128000;

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
    const model = options?.model ?? this.defaultModel;
    const response = await this.client.chat.completions.create(
      {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
      { signal: options?.signal }
    );
    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';
    if (!content.trim()) {
      // Reasoning models may leave content empty while reasoning_content holds
      // the thinking — log it for diagnosis (never used as document output).
      const reasoning = (choice?.message as { reasoning_content?: string } | undefined)?.reasoning_content ?? '';
      log.warn('[WF][AI] complete() returned empty content', {
        model,
        finishReason: choice?.finish_reason ?? null,
        reasoningLen: reasoning.length,
      });
    }
    return content;
  }

  async *stream(messages: AIMessage[], options?: CompletionOptions): AsyncIterable<string> {
    for await (const chunk of this.streamDetailed(messages, options)) {
      if (chunk.type === 'content') yield chunk.text;
    }
  }

  /**
   * Streams both the model's reasoning (`reasoning_content`) and its visible
   * output (`content`) as typed chunks. Reasoning deltas come first for
   * thinking models; the UI shows them live so long AI stages don't look stuck.
   */
  async *streamDetailed(messages: AIMessage[], options?: CompletionOptions): AsyncIterable<AIStreamChunk> {
    const model = options?.model ?? this.defaultModel;
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
      },
      { signal: options?.signal }
    );
    let total = 0;
    let finishReason: string | null = null;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      // `reasoning_content` is a non-standard OpenAI-compatible field used by
      // DeepSeek / Qwen thinking models — cast to read it defensively.
      const delta = choice?.delta as { content?: string; reasoning_content?: string } | undefined;
      const reasoning = delta?.reasoning_content;
      if (reasoning) {
        total += reasoning.length;
        yield { type: 'thinking', text: reasoning };
      }
      const content = delta?.content;
      if (content) {
        total += content.length;
        yield { type: 'content', text: content };
      }
    }
    log.info('[WF][AI] streamDetailed() finished', { model, chars: total, finishReason });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0]?.embedding ?? [];
  }
}
