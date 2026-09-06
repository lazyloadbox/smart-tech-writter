/**
 * 提示词相关共享类型（主进程 / 渲染进程共用）
 *
 * Prompt configuration separates editable guidance from the workflow contract.
 * The role and supplemental instructions are user-editable; output contracts
 * are owned by the application and exposed as read-only metadata.
 */

export type PromptOutputKind = 'json' | 'markdown' | 'xml' | 'text';

/** Read-only, human-readable representation of the output contract. */
export interface PromptOutputDisplay {
  format: PromptOutputKind;
  valueType: 'object' | 'array' | 'string';
  schema?: string;
  fields?: Record<string, string>;
  itemFields?: Record<string, string>;
  rules?: string[];
}

export interface PromptOutputFormat {
  kind: PromptOutputKind;
  label: string;
  description: string;
  schemaId?: string;
  /** JSON-safe display metadata; this is not editable and never persisted. */
  display: PromptOutputDisplay;
}

export interface PromptDefinition {
  /** 用户可修改的角色定义 */
  role: string;
  /** 用户可完全修改的补充指令 */
  instructions: string;
  /** 系统固定、只读展示的输出协议 */
  outputFormat: PromptOutputFormat;
}

export interface PromptOverride {
  /** 用户可修改的角色定义 */
  role?: string;
  /** 用户可完全修改的补充指令 */
  instructions?: string;
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
