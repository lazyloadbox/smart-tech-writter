/**
 * 提示词相关共享类型（主进程 / 渲染进程共用）
 *
 * 所有 AI 提示词被拆分为三个可独立覆盖的部分：
 * - role：角色设定（AI 的身份与专业背景）
 * - task：任务描述（AI 需要完成的具体工作）
 * - outputFormat：输出格式约束（响应格式与边界）
 */

/** 提示词的三个组成部分 */
export interface PromptParts {
  /** 角色设定：定义 AI 的身份与专业背景 */
  role: string;
  /** 任务描述：说明 AI 需要完成的具体任务 */
  task: string;
  /** 输出格式约束：规定响应的格式与边界 */
  outputFormat: string;
}

/** 一份完整的提示词定义（默认值） */
export type PromptDefinition = PromptParts;

/**
 * 细粒度提示词覆盖项。
 * - 设置 `system` 时整体替换 system prompt（优先级最高，忽略其余字段）
 * - 只设置 `role` / `task` / `outputFormat` 时，仅替换对应部分，其余沿用默认
 */
export interface PromptOverride {
  /** 整体覆盖 system prompt（优先级最高） */
  system?: string;
  /** 仅覆盖角色设定部分 */
  role?: string;
  /** 仅覆盖任务描述部分 */
  task?: string;
  /** 仅覆盖输出格式约束部分 */
  outputFormat?: string;
}

/** 所有可配置提示词的键（对应 PROMPTS 中的每个定义） */
export type PromptKey =
  | 'fileParser'
  | 'analyzer'
  | 'writer'
  | 'reviewer.aiReview'
  | 'reviewer.postEditReview'
  | 'reviewer.localizeAiReview'
  | 'reviewer.ditaAiReview'
  | 'localizer'
  | 'ditaLocalizer'
  | 'mapReduce.map'
  | 'mapReduce.reduce'
  | 'aiEditDraft';

/** 提示词覆盖集合（按提示词键） */
export type PromptOverrides = Partial<Record<PromptKey, PromptOverride>>;

/** 提示词目录条目（用于设置页展示与编辑） */
export interface PromptCatalogEntry {
  /** 提示词键 */
  key: PromptKey;
  /** 分组名（UI 分组展示） */
  group: string;
  /** 显示名称 */
  label: string;
  /** 说明 */
  description: string;
  /** 对应的工作流阶段 key（可多个，如 mapReduce 同时用于 upload_parse 与 analyze） */
  stage: string[];
  /** 对应的工作流阶段显示名（与 stage 一一对应） */
  stageLabel: string[];
  /** 默认提示词 */
  default: PromptDefinition;
}