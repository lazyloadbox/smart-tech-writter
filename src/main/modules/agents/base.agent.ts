import log from 'electron-log';
import { en as ui } from '../../../shared/i18n';
import type { AIProvider, AIStreamChunk } from '../ai-providers/base.provider';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentOutline } from '../../../shared/types/document.types';
import { buildSystemPrompt, type PromptDefinition, type PromptOverride, type PromptOverrides } from '../prompts';
import type { StructuredOutputContract } from '../ai-providers/output-contracts';
import { toResponseFormat } from '../ai-providers/output-contracts';

export interface AgentConfig {
  /**
   * 用户可编辑的角色与补充指令覆盖；输出协议不在此配置中。
   */
  promptOverride?: PromptOverride;
  /**
   * 全部提示词覆盖集合：供内部子流程（如 map-reduce 摘要）按提示词键取用。
   */
  promptOverrides?: PromptOverrides;
  /**
   * 兼容旧接口：作为补充指令处理，不再覆盖系统输出协议。
   */
  systemPromptTemplate?: string;
  /** 文档大纲（仅 WriterAgent 使用）：自定义章节结构，不再固定模板。 */
  documentOutline?: DocumentOutline;
  /**
   * 全局解析提示词（上传 & 解析阶段）：指导文件解析 Agent 的解析思路、重点与分析设计。
   * 单文件可通过 UploadedFile.parseInstruction 覆盖。
   */
  parseInstruction?: string;
  /** Optional progress callback for long-running preprocessing (e.g. map-reduce). */
  onProgress?: (message: string) => void;
  /** AbortSignal to cancel in-flight LLM calls (pause / go-back). */
  signal?: AbortSignal;
  /** Explicit output token cap for LLM calls (falls back to provider default). */
  maxTokens?: number;
}

export interface CallLLMOptions {
  model?: string;
  signal?: AbortSignal;
  maxTokens?: number;
  responseFormat?: import('../ai-providers/base.provider').ResponseFormat;
}

export abstract class BaseAgent {
  private _streamCallback?: (chunk: AIStreamChunk) => void;

  constructor(
    protected provider: AIProvider,
    protected config: AgentConfig = {}
  ) {}

  abstract get systemPrompt(): string;
  abstract execute(state: DocGenState): Promise<Partial<DocGenState>>;

  /**
   * 根据提示词定义与配置中的可编辑覆盖项构建 system prompt。
   */
  protected buildSystemPrompt(def: PromptDefinition): string {
    const override: PromptOverride | undefined =
      this.config.promptOverride ??
      (this.config.systemPromptTemplate ? { instructions: this.config.systemPromptTemplate } : undefined);
    return buildSystemPrompt(def, override);
  }

  /**
   * Enable streaming mode — callback invoked for each typed delta from the AI
   * (`thinking` = reasoning_content, `content` = visible output).
   */
  setStreamCallback(cb: (chunk: AIStreamChunk) => void): void {
    this._streamCallback = cb;
  }

  /**
   * Call the LLM. If a stream callback has been set via setStreamCallback(),
   * uses the provider's stream() method and invokes the callback for each chunk.
   * An optional AbortSignal cancels the in-flight request (pause / go-back).
   *
   * Empty-result guard: reasoning models (e.g. DeepSeek thinking variants) can
   * spend their entire output budget on reasoning and return empty `content`.
   * When the streamed result is empty we retry once via the non-streaming
   * complete() path; if that is also empty we throw so the stage fails loudly
   * instead of silently producing an empty document.
   */
  protected async callLLM(userPrompt: string, opts: CallLLMOptions = {}): Promise<string> {
    const messages = [
      { role: 'system' as const, content: this.systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
    const signal = opts.signal ?? this.config.signal;
    const maxTokens = opts.maxTokens ?? this.config.maxTokens;

    if (this._streamCallback) {
      let full = '';
      for await (const chunk of this.provider.streamDetailed(messages, { model: opts.model, signal, maxTokens, responseFormat: opts.responseFormat })) {
        if (chunk.type === 'content') full += chunk.text;
        this._streamCallback(chunk);
      }
      if (full.trim().length > 0) return full;

      log.warn('[WF][AI] streamDetailed() returned empty content — retrying via complete()', {
        agent: this.constructor.name,
        model: opts.model,
      });
      const retry = await this.provider.complete(messages, { model: opts.model, signal, maxTokens });
      if (retry.trim().length > 0) {
        // Surface the recovered content in the stream viewer as a single chunk.
        this._streamCallback({ type: 'content', text: retry });
        return retry;
      }
      throw new Error(`${ui.backend.aiEmpty} Model: ${opts.model ?? 'default'}.`);
    }

    return this.provider.complete(messages, { model: opts.model, signal, maxTokens, responseFormat: opts.responseFormat });
  }

  /** Call an LLM with a fixed application-owned JSON contract and validate it. */
  protected async callStructuredLLM<T>(
    userPrompt: string,
    contract: StructuredOutputContract<T>,
    opts: CallLLMOptions = {},
  ): Promise<T> {
    const responseFormat = toResponseFormat(contract as StructuredOutputContract<unknown>);
    let response: string;
    let providerSupportsStructured = true;
    try {
      response = await this.callLLM(userPrompt, { ...opts, responseFormat });
    } catch (error) {
      // OpenAI-compatible endpoints vary in their support for JSON Schema.
      // Fall back only for format-capability errors; auth/network failures
      // should still fail the workflow immediately.
      if (!isUnsupportedStructuredOutputError(error)) throw error;
      log.warn('[WF][AI] Structured output unsupported; falling back to prompt-enforced JSON', {
        agent: this.constructor.name,
        contract: contract.name,
      });
      providerSupportsStructured = false;
      response = await this.callLLM(userPrompt, opts);
    }

    const parsed = contract.parse(parseJsonValue(response));
    if (parsed !== null) return parsed;

    const repairPrompt = `The previous response did not match the required application schema. Return ONLY valid JSON matching the fixed output contract. Do not explain the correction.\n\nPrevious response:\n${response}`;
    const retry = await this.callLLM(
      repairPrompt,
      providerSupportsStructured ? { ...opts, responseFormat } : opts,
    );
    const repaired = contract.parse(parseJsonValue(retry));
    if (repaired !== null) return repaired;
    throw new Error(`${ui.backend.aiInvalidStructuredOutput} Contract: ${contract.name}.`);
  }
}

function parseJsonValue(response: string): unknown {
  const text = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '[' && text[i] !== '{') continue;
      const end = findJsonEnd(text, i);
      if (end < 0) continue;
      try { return JSON.parse(text.slice(i, end + 1)) as unknown; } catch { /* try next candidate */ }
    }
    return null;
  }
}

function findJsonEnd(text: string, start: number): number {
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '[';
      if (stack.pop() !== expected) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

function isUnsupportedStructuredOutputError(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string } | undefined;
  const message = String(candidate?.message ?? error).toLowerCase();
  return candidate?.status === 400 && /response.?format|json.?schema|structured output|unsupported/.test(message);
}
