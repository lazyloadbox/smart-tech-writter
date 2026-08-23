/**
 * 提示词统一管理模块
 *
 * 所有 AI 提示词集中定义于此，统一处理：
 * - 每个 Agent 的 system prompt 拆分为 role / task / outputFormat 三部分
 * - 通过 buildSystemPrompt() 组合，支持细粒度覆盖（PromptOverride）
 * - 文档撰写章节结构由 DocumentOutline 参数化，不再固定模板
 * - 本地化语言指令（术语约定）集中维护
 *
 * 使用方式：
 *   import { PROMPTS, buildSystemPrompt } from '../prompts';
 *   buildSystemPrompt(PROMPTS.fileParser, this.config.promptOverride)
 */
import type { PromptDefinition, PromptOverride, PromptKey, PromptOverrides, PromptCatalogEntry } from './types';
import type { AnalysisResult, DocumentOutline, LocalizeLanguage } from '../../../shared/types/document.types';
import { LOCALIZE_LANGUAGE_LABELS } from '../../../shared/types/document.types';
import { getSetting, setSetting } from '../storage/database';

export * from './types';

/**
 * 根据提示词定义与覆盖项构建最终的 system prompt。
 * 优先级：override.system > 逐部分覆盖（role/task/outputFormat）> 默认定义。
 */
export function buildSystemPrompt(def: PromptDefinition, override?: PromptOverride): string {
  if (override?.system) return override.system;
  const role = override?.role ?? def.role;
  const task = override?.task ?? def.task;
  const outputFormat = override?.outputFormat ?? def.outputFormat;
  return [role, task, outputFormat].filter((s) => s.trim().length > 0).join('\n');
}

/** 默认文档大纲（6 章节，与历史行为一致） */
export const DEFAULT_DOCUMENT_OUTLINE: DocumentOutline = {
  sections: [
    'Executive Summary',
    'Product/Feature Overview',
    'Technical Specifications',
    'Key Features and Functions',
    'Requirements and Dependencies',
    'Implementation Notes',
  ],
  mergeIntoSingle: true,
};

/** 将文档大纲渲染为提示词中的章节列表文本 */
export function renderOutline(outline: DocumentOutline): string {
  return outline.sections.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

/**
 * 所有 Agent 的 system prompt 定义（统一管理）。
 * 每个 Agent 通过 buildSystemPrompt(PROMPTS.xxx, override) 获取最终 system prompt。
 */
export const PROMPTS = {
  /** 文件解析 Agent */
  fileParser: {
    role: `You are a technical document analyst for industrial automation systems.`,
    task: `Given raw extracted text from a document, produce a JSON object with:
- summary: a concise summary of the document content
- keyPoints: array of key technical points (max 10)
- keywords: array of relevant technical keywords (max 20)
- technicalTerms: array of domain-specific terms found (e.g., PLC, HMI, SCADA)`,
    outputFormat: `Respond ONLY with valid JSON, no markdown fences.`,
  },

  /** 内容分析 Agent */
  analyzer: {
    role: `You are a senior technical writer for industrial automation documentation.`,
    task: `Analyze the provided documents and reference materials, then produce a JSON array of analysis results.
Each result must have:
- fileId: the file's id
- fileName: the file's name
- summary: concise content summary
- keyPoints: key technical points (max 10)
- keywords: relevant keywords (max 15)
- technicalTerms: domain-specific terms found`,
    outputFormat: `Respond ONLY with valid JSON array, no markdown fences.`,
  },

  /** 文档撰写 Agent（章节结构由 DocumentOutline 参数化） */
  writer: {
    role: `You are an expert technical writer specializing in industrial automation documentation.`,
    task: `Generate ONE well-structured technical document in Markdown format that synthesizes ALL the provided analysis results into a single coherent document.
The analysis results may come from multiple source files — merge related information across files into unified chapters instead of writing one document per file.
Produce clear, precise, professional content suitable for engineers and operators.
Use proper Markdown headings, bullet points, tables where appropriate.`,
    outputFormat: `Use appropriate Markdown formatting.`,
  },

  /** 质量评审 Agent（按模式区分） */
  reviewer: {
    aiReview: {
      role: `You are a technical documentation quality reviewer.`,
      task: `Review the draft document for technical accuracy, clarity, completeness, and style consistency.
Produce a JSON array of review comments. Each comment must have: { id, draftId, type (suggestion|error|warning|info), section, originalText, suggestedText, explanation }`,
      outputFormat: `Respond ONLY with valid JSON array, no markdown fences.`,
    },
    postEditReview: {
      role: `You are a technical editor reviewing human-edited documentation.`,
      task: `Check for consistency, completeness, and technical accuracy after human edits.
Produce a JSON array of review comments. Each comment: { id, draftId, type, section, originalText, suggestedText, explanation }`,
      outputFormat: `Respond ONLY with valid JSON array.`,
    },
    localizeAiReview: {
      role: `You are a localization quality reviewer.`,
      task: `Check the localized document for translation accuracy, technical term consistency, and natural language flow.
Produce a JSON array of review comments. Each comment: { id, draftId, type, section, originalText, suggestedText, explanation }`,
      outputFormat: `Respond ONLY with valid JSON array.`,
    },
    ditaAiReview: {
      role: `You are a DITA XML technical reviewer.`,
      task: `Review the generated DITA 1.3 concept topic XML for: well-formedness, correct element nesting (concept/conbody/section/p/ul/ol/li/codeblock), valid escaping of special characters, appropriate section structure, and content fidelity to the source.
Produce a JSON array of review comments. Each comment: { id, draftId, type (suggestion|error|warning|info), section, originalText, suggestedText, explanation }
The originalText/suggestedText should quote the relevant XML fragment when proposing a fix.`,
      outputFormat: `Respond ONLY with valid JSON array, no markdown fences.`,
    },
  },

  /** 本地化 Agent */
  localizer: {
    role: `You are an expert technical translator and localizer.`,
    task: `Translate and localize technical documents accurately while preserving all formatting.
Use the target language's standard technical terminology and conventions.`,
    outputFormat: ``,
  },

  /** DITA 本地化 Agent（独立功能：翻译已生成的 DITA 文件） */
  ditaLocalizer: {
    role: `You are an expert technical translator specializing in DITA XML documents.`,
    task: `Translate the text content of the given DITA 1.3 XML document into the target language while preserving the XML structure exactly.
Requirements:
- Translate ONLY the human-readable text inside elements (titles, paragraphs, list items, table cells, etc.).
- Keep ALL XML tags, attributes, attribute values, and element structure unchanged.
- Keep the XML declaration and DOCTYPE declaration unchanged.
- Keep code blocks (<codeblock>), inline code (<codeph>), and <xref href="..."> link targets unchanged.
- Preserve all entities and special characters exactly as-is.
- Use the target language's standard technical terminology.
- Output ONLY the complete translated DITA XML document — no explanations, no markdown fences.`,
    outputFormat: `Output ONLY the translated DITA XML document.`,
  },

  /** Map-Reduce 长文本摘要 */
  mapReduce: {
    map: {
      role: `You are a technical document summarizer.`,
      task: `Summarize the given section of a technical document. Preserve:
- All key technical facts, specifications, numbers, units, and parameter values
- Important terminology, acronyms, and product/component names
- Code/API references and configuration details
- Relationships between concepts
Write a dense, factual summary (up to 400 words). Do not add commentary or opinions.`,
      outputFormat: ``,
    },
    reduce: {
      role: `You are merging section summaries of a technical document into a single coherent overview.`,
      task: `Combine the following section summaries into one dense technical summary (up to 800 words).
Preserve all key technical facts, specifications, numbers, terminology, and relationships.
Remove redundancy between sections. Do not add commentary or opinions.`,
      outputFormat: ``,
    },
  },

  /** AI 辅助编辑（aiEditDraft） */
  aiEditDraft: {
    role: `You are an expert technical writer and editor.`,
    task: `You will be given the current draft of a technical document (in Markdown) and an editing instruction from the user.
Apply the instruction precisely to the relevant section(s) or content, preserving the overall structure, headings, and Markdown formatting.
Keep all unchanged sections intact.
Maintain the language of the current draft unless the instruction asks otherwise.`,
    outputFormat: `Return ONLY the full edited Markdown document — no explanations, no preamble, no code fences.`,
  },
};

/**
 * 提示词目录：设置页据此展示所有可配置提示词。
 * 每个条目对应 PROMPTS 中的一个定义，支持按 role/task/outputFormat 覆盖。
 * `stage` / `stageLabel` 标明该提示词在工作流中的哪个 step 被使用。
 */
export const PROMPT_CATALOG: PromptCatalogEntry[] = [
  {
    key: 'fileParser',
    group: '解析',
    label: '文件解析 Agent',
    stage: ['upload_parse'],
    stageLabel: ['上传 & 解析'],
    description: '读取文件内容后生成结构化摘要（summary / keyPoints / keywords / technicalTerms）。',
    default: PROMPTS.fileParser,
  },
  {
    key: 'analyzer',
    group: '分析',
    label: '内容分析 Agent',
    stage: ['analyze'],
    stageLabel: ['AI 分析'],
    description: '结合参考文档对输入文件做深度分析，产出 JSON 分析结果数组。',
    default: PROMPTS.analyzer,
  },
  {
    key: 'writer',
    group: '撰写',
    label: '文档撰写 Agent',
    stage: ['draft'],
    stageLabel: ['生成草稿'],
    description: '将分析结果综合为一份连贯的技术文档（Markdown，章节结构由文档大纲参数化）。',
    default: PROMPTS.writer,
  },
  {
    key: 'reviewer.aiReview',
    group: '评审',
    label: '质量评审 Agent（AI 评审）',
    stage: ['ai_review'],
    stageLabel: ['AI Review'],
    description: '对草稿进行技术准确性、清晰度、完整性与风格一致性评审，产出 JSON 评审意见。',
    default: PROMPTS.reviewer.aiReview,
  },
  {
    key: 'reviewer.postEditReview',
    group: '评审',
    label: '质量评审 Agent（编辑后评审）',
    stage: ['post_edit_review'],
    stageLabel: ['编辑后 Review'],
    description: '人工编辑后的一致性、完整性与技术准确性复查。',
    default: PROMPTS.reviewer.postEditReview,
  },
  {
    key: 'reviewer.localizeAiReview',
    group: '评审',
    label: '质量评审 Agent（本地化评审）',
    stage: ['localize_ai_review'],
    stageLabel: ['本地化 Review'],
    description: '检查本地化文档的翻译准确性、术语一致性与语言流畅度。',
    default: PROMPTS.reviewer.localizeAiReview,
  },
  {
    key: 'reviewer.ditaAiReview',
    group: '评审',
    label: '质量评审 Agent（DITA 评审）',
    stage: ['dita_ai_review'],
    stageLabel: ['DITA AI Review'],
    description: '审查生成的 DITA 1.3 concept topic XML 的结构、嵌套与转义正确性。',
    default: PROMPTS.reviewer.ditaAiReview,
  },
  {
    key: 'localizer',
    group: '本地化',
    label: '本地化 Agent',
    stage: ['localize'],
    stageLabel: ['本地化'],
    description: '将技术文档翻译并本地化到目标语言，保留全部格式。',
    default: PROMPTS.localizer,
  },
  {
    key: 'ditaLocalizer',
    group: '本地化',
    label: 'DITA 本地化 Agent',
    stage: ['localize'],
    stageLabel: ['DITA 本地化'],
    description: '将已生成的 DITA XML 文件翻译为多语言版本，保留全部 XML 结构与代码块。',
    default: PROMPTS.ditaLocalizer,
  },
  {
    key: 'mapReduce.map',
    group: '摘要',
    label: 'Map-Reduce 分段摘要（map）',
    stage: ['upload_parse', 'analyze'],
    stageLabel: ['上传 & 解析', 'AI 分析'],
    description: '长文档分段摘要：保留关键事实、规格、术语与代码引用。在文件解析与内容分析阶段，超长文档会先分段摘要再交给 Agent。',
    default: PROMPTS.mapReduce.map,
  },
  {
    key: 'mapReduce.reduce',
    group: '摘要',
    label: 'Map-Reduce 合并摘要（reduce）',
    stage: ['upload_parse', 'analyze'],
    stageLabel: ['上传 & 解析', 'AI 分析'],
    description: '将各段摘要合并为一份连贯的总体摘要，去除冗余。与 map 配合，用于超长文档的预处理。',
    default: PROMPTS.mapReduce.reduce,
  },
  {
    key: 'aiEditDraft',
    group: '编辑',
    label: 'AI 辅助编辑',
    stage: ['review_draft'],
    stageLabel: ['审阅草稿'],
    description: '根据用户编辑指令修改当前草稿（审阅草稿阶段点击「AI 编辑」时使用）。',
    default: PROMPTS.aiEditDraft,
  },
];

/**
 * 本地化语言指令（按目标语言区分术语约定）。
 * 地区差异通过显式规则约束翻译，避免模型凭训练数据猜测地区用词。
 */
export const LOCALIZE_LANGUAGE_PROMPTS: Record<LocalizeLanguage, { label: string; instruction: string }> = {
  en: {
    label: 'English',
    instruction: `Translate and localize the technical document to English.
Use standard English technical terminology and conventions.
Preserve all Markdown formatting, code blocks, and document structure.`,
  },
  'zh-CN': {
    label: 'Simplified Chinese (简体中文)',
    instruction: `Translate and localize the technical document to Simplified Chinese (zh-CN / 简体中文).
Use standard Simplified Chinese technical terminology commonly used in mainland China.
For industrial automation terms, use PRC standard terminology.
Preserve all Markdown formatting, code blocks, and document structure.`,
  },
  'zh-TW': {
    label: 'Traditional Chinese - Taiwan (繁體中文-台灣)',
    instruction: `Translate and localize the technical document to Traditional Chinese as used in Taiwan (zh-TW / 繁體中文-台灣).
Use Taiwan-specific technical terminology and conventions:
- "程式" not "程序" for program
- "檔案" not "文件" for file
- "資訊" not "信息" for information
- "軟體" not "軟件" for software
- "硬體" not "硬件" for hardware
- "伺服器" not "服務器" for server
- "資料庫" not "數據庫" for database
- "網路" not "網絡" for network
- "數位" not "數字" for digital
- "佇列" not "隊列" for queue
- "物件" not "對象" for object
- "指標" not "指針" for pointer
- "匯流排" not "總線" for bus
- "韌體" not "固件" for firmware
Use Taiwan customary expressions and measurement units (公制 with Taiwan conventions).
Preserve all Markdown formatting, code blocks, and document structure.`,
  },
};

// ---------------------------------------------------------------------------
// User prompt 构建函数（统一处理各阶段的 user prompt 组装）
// ---------------------------------------------------------------------------

/** 文件解析 Agent 的 user prompt（instruction 为用户解析提示词，可选） */
export function buildFileParserUserPrompt(fileName: string, context: string, instruction?: string): string {
  const instructionBlock = instruction?.trim()
    ? `\n\nUser parsing instructions (follow these when analyzing the document):\n${instruction.trim()}`
    : '';
  return `Document name: ${fileName}\n\nExtracted text:\n${context}${instructionBlock}`;
}

/** 内容分析 Agent 的 user prompt */
export function buildAnalyzerUserPrompt(filesContextStr: string, refContext: string): string {
  return `Analyze the following input documents:\n\n${filesContextStr}${refContext}\n\nProduce detailed analysis results for each input file.`;
}

/** 文档撰写 Agent 的 system prompt（章节结构由 outline 参数化） */
export function buildWriterSystemPrompt(outline: DocumentOutline, override?: PromptOverride): string {
  const task = outline.mergeIntoSingle
    ? `Generate ONE well-structured technical document in Markdown format that synthesizes ALL the provided analysis results into a single coherent document.
The analysis results may come from multiple source files — merge related information across files into unified chapters instead of writing one document per file.
Produce clear, precise, professional content suitable for engineers and operators.
Use proper Markdown headings, bullet points, tables where appropriate.`
    : `Generate well-structured technical documentation in Markdown format from the provided analysis results.
Produce clear, precise, professional content suitable for engineers and operators.
Use proper Markdown headings, bullet points, tables where appropriate.`;
  return buildSystemPrompt({ role: PROMPTS.writer.role, task, outputFormat: PROMPTS.writer.outputFormat }, override);
}

/** 文档撰写 Agent 的 user prompt（章节结构由 outline 参数化） */
export function buildWriterPrompt(
  analysisResults: AnalysisResult[],
  ingestContext: string,
  outline: DocumentOutline
): string {
  const outlineText = renderOutline(outline);
  if (analysisResults.length === 0) {
    return `Based on the following input, generate a comprehensive technical document:\n\n${ingestContext || 'No analysis available.'}\n\nProduce a well-structured Markdown document with:\n${outlineText}\n\nUse appropriate Markdown formatting.`;
  }
  const combinedContext = analysisResults
    .map(
      (r) =>
        `## Source File: ${r.fileName}\nSummary: ${r.summary}\nKey Points: ${r.keyPoints.join(', ')}\nKeywords: ${r.keywords.join(', ')}\nTechnical Terms: ${r.technicalTerms.join(', ')}`
    )
    .join('\n\n---\n\n');
  const mergeClause = outline.mergeIntoSingle
    ? `Synthesize ALL of them into ONE single comprehensive technical document. Integrate and cross-reference the content from every file — merge related information into unified chapters so the result reads as one coherent document covering the whole subject, not a separate section per file.`
    : `Generate a technical document from the analysis results.`;
  return `The following analysis results were extracted from ${analysisResults.length} source file(s). ${mergeClause}\n\n${combinedContext}\n\nProduce a well-structured Markdown document with:\n${outlineText}\n\nUse appropriate Markdown formatting.`;
}

/** 质量评审 Agent 的 user prompt */
export function buildReviewUserPrompt(draftsContext: string, humanEditsNote: string): string {
  return `Review the following document(s):\n\n${draftsContext}${humanEditsNote}`;
}

/** 质量评审 Agent 的 JSON 修复重试 prompt */
export function buildReviewFixPrompt(previousResponse: string): string {
  return `Your previous response was not valid JSON. Output ONLY a corrected JSON array of review comments (same schema as requested). No markdown fences, no prose.\n\nPrevious response:\n${previousResponse}`;
}

/** 本地化 Agent 的 user prompt */
export function buildLocalizerUserPrompt(instruction: string, content: string): string {
  return `${instruction}\n\n---\n\nDocument to translate:\n\n${content}`;
}

/** DITA 本地化 Agent 的 user prompt（mappingContext 为翻译术语映射，可选） */
export function buildDitaLocalizerUserPrompt(
  instruction: string,
  ditaXml: string,
  mappingContext?: string
): string {
  const mappingBlock = mappingContext?.trim()
    ? `\n\n${mappingContext.trim()}\n\nUse the glossary above as the authoritative reference for the corresponding terms.`
    : '';
  return `${instruction}${mappingBlock}\n\n---\n\nDITA XML document to translate:\n\n${ditaXml}`;
}

/**
 * DITA 本地化评审 Agent 的 user prompt（独立本地化工具）。
 * 同时给出原文与本地化后的 DITA XML，供 AI 对比评审翻译质量。
 * mode 区分首次本地化评审（localize_ai_review）与人工编辑后评审（post_edit_review）。
 * mappingContext 为翻译术语映射（可选），用于标记偏离已确认术语的翻译。
 */
export function buildDitaReviewUserPrompt(
  originalXml: string,
  localizedXml: string,
  targetLanguage: LocalizeLanguage,
  mode: 'localize_ai_review' | 'post_edit_review',
  mappingContext?: string
): string {
  const langLabel = LOCALIZE_LANGUAGE_LABELS[targetLanguage] ?? targetLanguage;
  const modeNote =
    mode === 'post_edit_review'
      ? 'The localized document below has been edited by a human reviewer. Review the edited result for consistency, completeness, and translation quality against the original.'
      : 'Review the translation quality of the localized document against the original.';
  const mappingBlock = mappingContext?.trim()
    ? `\n\n${mappingContext.trim()}\n\nFlag any translation that deviates from the glossary above.`
    : '';
  return `${modeNote}
Target language: ${langLabel}${mappingBlock}
${originalXml}

## Localized DITA XML
${localizedXml}

Produce a JSON array of review comments. Each comment: { id, draftId, type (suggestion|error|warning|info), section, originalText, suggestedText, explanation }
The originalText/suggestedText should quote the relevant XML text fragment when proposing a fix.`;
}

/** AI 辅助编辑的 user prompt */
export function buildAiEditDraftUserPrompt(instruction: string, currentContent: string): string {
  return `Editing instruction:\n${instruction}\n\n---\n\nCurrent draft (Markdown):\n${currentContent}\n\n---\n\nApply the instruction and return the complete edited Markdown document.`;
}

/** Map-Reduce 分段摘要（map）的 user prompt（instruction 为用户解析提示词，可选） */
export function buildMapUserPrompt(index: number, total: number, chunk: string, instruction?: string): string {
  const instructionBlock = instruction?.trim()
    ? `\n\nUser focus instructions (prioritize these when summarizing):\n${instruction.trim()}`
    : '';
  return `Section ${index}/${total}:\n\n${chunk}${instructionBlock}`;
}

/** Map-Reduce 合并摘要（reduce）的 user prompt（instruction 为用户解析提示词，可选） */
export function buildReduceUserPrompt(combined: string, instruction?: string): string {
  const instructionBlock = instruction?.trim()
    ? `\n\nUser focus instructions (prioritize these when merging the summaries):\n${instruction.trim()}`
    : '';
  return `${combined}${instructionBlock}`;
}

// ---------------------------------------------------------------------------
// 提示词覆盖持久化（settings 表）
// ---------------------------------------------------------------------------

const PROMPT_OVERRIDES_KEY = 'prompts.overrides';

/** 从 settings 表读取已保存的提示词覆盖 */
export function loadPromptOverrides(): PromptOverrides {
  const raw = getSetting(PROMPT_OVERRIDES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PromptOverrides)
      : {};
  } catch {
    return {};
  }
}

/** 保存提示词覆盖到 settings 表 */
export function savePromptOverrides(overrides: PromptOverrides): void {
  setSetting(PROMPT_OVERRIDES_KEY, JSON.stringify(overrides));
}

/** 清空提示词覆盖（恢复默认） */
export function resetPromptOverrides(): void {
  setSetting(PROMPT_OVERRIDES_KEY, '{}');
}

/** 获取提示词目录与当前覆盖（供设置页展示） */
export function getPromptCatalogWithOverrides(): {
  catalog: PromptCatalogEntry[];
  overrides: PromptOverrides;
} {
  return {
    catalog: PROMPT_CATALOG,
    overrides: loadPromptOverrides(),
  };
}

/** 根据提示词键从覆盖集合中取对应覆盖项 */
export function getOverrideFor(
  overrides: PromptOverrides | undefined,
  key: PromptKey
): PromptOverride | undefined {
  return overrides?.[key];
}