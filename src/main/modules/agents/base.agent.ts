import log from 'electron-log';
import type { AIProvider, AIStreamChunk } from '../ai-providers/base.provider';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentOutline } from '../../../shared/types/document.types';
import { buildSystemPrompt, type PromptDefinition, type PromptOverride, type PromptOverrides } from '../prompts';

export interface AgentConfig {
  /**
   * 细粒度提示词覆盖：可整体（system）或按部分（role/task/outputFormat）
   * 覆盖 system prompt。优先级高于 systemPromptTemplate。
   */
  promptOverride?: PromptOverride;
  /**
   * 全部提示词覆盖集合：供内部子流程（如 map-reduce 摘要）按提示词键取用。
   */
  promptOverrides?: PromptOverrides;
  /**
   * 兼容旧接口：整体覆盖 system prompt（等价于 promptOverride.system）。
   * 建议改用 promptOverride 以获得细粒度覆盖能力。
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
   * 根据提示词定义与配置中的覆盖项构建 system prompt。
   * 覆盖优先级：promptOverride.system > promptOverride 逐部分 > systemPromptTemplate（旧接口）> 默认定义。
   */
  protected buildSystemPrompt(def: PromptDefinition): string {
    const override: PromptOverride | undefined =
      this.config.promptOverride ??
      (this.config.systemPromptTemplate ? { system: this.config.systemPromptTemplate } : undefined);
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
      for await (const chunk of this.provider.streamDetailed(messages, { model: opts.model, signal, maxTokens })) {
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
      throw new Error(
        `AI 返回内容为空（模型 ${opts.model ?? '默认'} 可能将输出预算耗尽在推理过程）。请重试或更换模型。`
      );
    }

    return this.provider.complete(messages, { model: opts.model, signal, maxTokens });
  }
}
