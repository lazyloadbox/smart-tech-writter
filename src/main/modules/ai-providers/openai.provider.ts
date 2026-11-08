import OpenAI from 'openai';
import log from 'electron-log';
import { randomUUID } from 'node:crypto';
import type { AIProvider, AIMessage, AIStreamChunk, AIToolCall, AIToolCallResult, CompletionOptions, ProviderConfig, ReasoningEffort } from './base.provider';

/**
 * Default output token cap applied when a caller doesn't specify maxTokens.
 * Reasoning models (e.g. DeepSeek thinking variants) can spend their entire
 * output budget on reasoning_content and return an empty `content`; an explicit
 * cap gives the answer room to be emitted. Set to 128k to match the DeepSeek
 * V4 Flash 128K context window.
 */
export const DEFAULT_MAX_TOKENS = 128000;

/**
 * OpenCode Go/Console requires a stable per-conversation session id in this
 * header; without it the request is rejected with HTTP 400:
 * "Request is missing x-opencode-session and cannot be routed efficiently."
 * @see https://opencode.ai/docs/console/go/#where-can-i-use-it
 */
export const OPENCODE_SESSION_HEADER = 'x-opencode-session';

/**
 * OpenCode asks clients to identify themselves with their own user agent
 * rather than a generic SDK/HTTP-library name.
 */
export const OPENCODE_USER_AGENT = 'smart-tech-writer/1.0';

/**
 * Stable session id for this app process. Keeping it at module scope means a
 * provider re-created from the settings screen (reloadProvider) keeps routing
 * to the same session, and `OPENCODE_SESSION_ID` can pin it explicitly.
 */
const OPENCODE_SESSION_ID = process.env.OPENCODE_SESSION_ID?.trim() || `stw-${randomUUID()}`;

/** Only OpenCode-hosted base URLs get the extra session/UA headers. */
export function isOpenCodeEndpoint(baseURL?: string): boolean {
  if (!baseURL) return false;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
  } catch {
    // Not an absolute URL (e.g. a bare path) — never assume OpenCode.
    return false;
  }
}

export class OpenAIProvider implements AIProvider {
  readonly providerName = 'openai';
  private client: OpenAI;
  private defaultModel: string;
  private reasoningEffort?: ReasoningEffort;

  constructor(config: ProviderConfig) {
    const openCode = isOpenCodeEndpoint(config.baseURL);
    if (openCode) {
      const baseURL = config.baseURL!;
      // Non-OpenCode endpoints must not receive these headers: many
      // OpenAI-compatible servers reject unknown request headers/agents.
      this.client = new OpenAI({
        apiKey: config.apiKey || 'NOT_CONFIGURED',
        baseURL,
        defaultHeaders: {
          [OPENCODE_SESSION_HEADER]: config.sessionId?.trim() || OPENCODE_SESSION_ID,
          'user-agent': OPENCODE_USER_AGENT,
        },
      });
      log.info('[WF][AI] OpenCode endpoint detected; session header enabled', {
        baseURL,
        sessionId: config.sessionId?.trim() || OPENCODE_SESSION_ID,
      });
    } else {
      // Use a placeholder if apiKey is empty to prevent the SDK from throwing at
      // construction time; actual requests will fail with a clear auth error instead.
      this.client = new OpenAI({
        apiKey: config.apiKey || 'NOT_CONFIGURED',
        baseURL: config.baseURL || undefined,
      });
    }
    this.defaultModel = config.defaultModel ?? 'gpt-4o';
    this.reasoningEffort = config.reasoningEffort;
  }

  async complete(messages: AIMessage[], options?: CompletionOptions): Promise<string> {
    throwIfAborted(options?.signal);
    const model = options?.model ?? this.defaultModel;
    const response = await this.client.chat.completions.create(
      {
        model,
        messages: messages as never,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
        ...reasoningEffortParams(model, options?.reasoningEffort ?? this.reasoningEffort),
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

  /**
   * Tool-enabled completion (P4-8). Returns the assistant message plus any
   * tool calls so the caller can execute them and continue the conversation.
   */
  async completeWithTools(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<AIToolCallResult> {
    throwIfAborted(options?.signal);
    const model = options?.model ?? this.defaultModel;
    const response = await this.client.chat.completions.create(
      {
        model,
        messages: messages as never,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(options?.tools && options.tools.length > 0
          ? { tools: options.tools as never, tool_choice: options.toolChoice ?? 'auto' }
          : {}),
        ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
        ...reasoningEffortParams(model, options?.reasoningEffort ?? this.reasoningEffort),
      },
      { signal: options?.signal }
    );
    const message = response.choices[0]?.message;
    const toolCalls: AIToolCall[] = (message?.tool_calls ?? []).map((call) => {
      const fn = (call as { function?: { name?: string; arguments?: string } }).function;
      return {
        id: call.id,
        name: fn?.name ?? '',
        arguments: fn?.arguments ?? '',
      };
    });
    return { content: message?.content ?? '', toolCalls };
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
    throwIfAborted(options?.signal);
    const model = options?.model ?? this.defaultModel;
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages: messages as never,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
        ...reasoningEffortParams(model, options?.reasoningEffort ?? this.reasoningEffort),
      },
      { signal: options?.signal }
    );
    let total = 0;
    let finishReason: string | null = null;
    for await (const chunk of stream) {
      throwIfAborted(options?.signal);
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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('AI request aborted');
  error.name = 'AbortError';
  throw error;
}

/**
 * These are the only models currently enabled by the application that expose
 * an OpenAI-compatible reasoning_effort field. Never send the field to an
 * unknown model: many compatible endpoints reject unknown request fields.
 */
function reasoningEffortParams(model: string, effort?: ReasoningEffort): Record<string, string> {
  if (!effort || !supportsReasoningEffort(model)) return {};
  return { reasoning_effort: effort };
}

function supportsReasoningEffort(model: string): boolean {
  const normalized = model.toLowerCase().replace(/[\s_]+/g, '-');
  return /qwen.*3[.-](?:5|6|8)(?:[-.]|$)/.test(normalized)
    || /deepseek.*v?4.*flash/.test(normalized);
}
