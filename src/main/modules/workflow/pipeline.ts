import type { DocGenState } from '../../../shared/types/workflow.types';
import type { AIProvider, AIStreamChunk } from '../ai-providers/base.provider';
import type { DocumentSearchService } from '../rag/local-search.service';
import { FileParserAgent } from '../agents/file-parser.agent';
import { AnalyzerAgent } from '../agents/analyzer.agent';
import { WriterAgent } from '../agents/writer.agent';
import { ReviewerAgent } from '../agents/reviewer.agent';
import { LocalizerAgent } from '../agents/localizer.agent';
import { createReader } from '../file-readers';
import { buildDitaXml, validateDitaXml } from '../document-builder/dita.builder';
import { buildDocx } from '../document-builder/docx.builder';
import { writeProjectBinaryFile } from '../storage/file-storage';
import { PAUSE_STAGES, getStatusForStage, nextStage } from './state-machine';
import { v4 as uuidv4 } from 'uuid';
import type { OutputDocument, UploadedFile, DocumentDraft } from '../../../shared/types/document.types';
import type { StageName } from '../../../shared/types/workflow.types';
import type { PromptOverrides } from '../prompts';
import log from 'electron-log';

export type ProgressCallback = (stage: StageName, message: string, data?: unknown) => void;
export type StreamCallback = (stage: StageName, chunk: AIStreamChunk) => void;

export interface PipelineConfig {
  provider: AIProvider;
  ragService: DocumentSearchService;
  /** AbortSignal from the graph invoke — lets pause/go-back cancel LLM calls. */
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  onStream?: StreamCallback;
  /** 用户配置的提示词覆盖（按提示词键），应用到各 Agent 的 system prompt。 */
  promptOverrides?: PromptOverrides;
}

export async function runUploadParseStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('upload_parse', '📂 开始读取文件内容...');
  const updatedFiles: UploadedFile[] = [];

  for (const file of state.inputFiles) {
    if (file.parseStatus !== 'pending') {
      updatedFiles.push(file);
      continue;
    }
    try {
      config.onProgress?.('upload_parse', `读取文件: ${file.name}`);
      const reader = createReader(file.path);
      const result = await reader.read(file.path);
      config.onProgress?.('upload_parse', `文件读取完成: ${file.name} (${result.text.length} 字符)`);
      updatedFiles.push({
        ...file,
        parseStatus: 'parsing',
        extractedText: result.text,
        metadata: result.metadata,
      });
    } catch (err) {
      log.error('File read error:', err);
      updatedFiles.push({ ...file, parseStatus: 'error', parseError: String(err) });
    }
  }

  // Now run AI parsing on all 'parsing' files
  const agentState = { ...state, inputFiles: updatedFiles };
  const agent = new FileParserAgent(config.provider, {
    onProgress: (msg) => config.onProgress?.('upload_parse', msg),
    signal: config.signal,
    promptOverride: config.promptOverrides?.fileParser,
    promptOverrides: config.promptOverrides,
    parseInstruction: state.parseInstruction,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('upload_parse', chunk));
  config.onProgress?.('upload_parse', '🤖 AI 正在解析文档内容...');
  return agent.execute(agentState);
}

/**
 * Ingest stage (M7): aggregates the parsed files into a single structured
 * context consumed by the analyze stage. Previously this was a counting
 * no-op; now it produces `ingestContext` (per-file metadata + AI summary +
 * extracted text) so the analyzer doesn't have to re-read/re-summarize files.
 */
export async function runIngestStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('ingest', '📥 汇总结构化数据...');
  const readyFiles = state.inputFiles.filter((f) => f.parseStatus === 'done');
  const errorFiles = state.inputFiles.filter((f) => f.parseStatus === 'error');
  config.onProgress?.('ingest', `就绪文件: ${readyFiles.length} 个${errorFiles.length > 0 ? `, 错误文件: ${errorFiles.length} 个` : ''}`);

  const sections = readyFiles.map((f) => {
    const meta = f.metadata && Object.keys(f.metadata).length > 0
      ? `\nMetadata: ${JSON.stringify(f.metadata)}`
      : '';
    const summary = f.parseSummary ? `\nSummary: ${f.parseSummary}` : '';
    const text = f.extractedText ? `\nContent:\n${f.extractedText}` : '';
    return `## File: ${f.name} (${f.type || 'unknown'})${meta}${summary}${text}`;
  });
  const ingestContext = sections.join('\n\n---\n\n');

  config.onProgress?.('ingest', `✅ 已汇总 ${readyFiles.length} 个文件的结构化数据 (${ingestContext.length} 字符)`);
  log.info(`Ingest: ${readyFiles.length} files ready, context ${ingestContext.length} chars`);
  return { ingestContext };
}

export async function runAnalyzeStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('analyze', '🔍 AI 正在分析文档内容...');
  // First run local search for reference materials
  const searchQuery = state.inputFiles
    .filter((f) => f.parseStatus === 'done')
    .map((f) => f.parseSummary ?? f.name)
    .join(' ') || 'technical documentation';

  config.onProgress?.('analyze', `搜索参考资料: "${searchQuery.slice(0, 80)}..."`);
  const refResults = await config.ragService.search(searchQuery);
  config.onProgress?.('analyze', `找到 ${refResults.length} 份参考资料`, refResults);

  const stateWithRefs = { ...state, referenceSearchResults: refResults };
  const agent = new AnalyzerAgent(config.provider, {
    onProgress: (msg) => config.onProgress?.('analyze', msg),
    signal: config.signal,
    promptOverride: config.promptOverrides?.analyzer,
    promptOverrides: config.promptOverrides,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('analyze', chunk));
  config.onProgress?.('analyze', '🤖 AI 深度分析中...');
  return agent.execute(stateWithRefs);
}

export async function runDraftStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('draft', '✍️ AI 正在生成文档草稿...');
  const agent = new WriterAgent(config.provider, {
    signal: config.signal,
    documentOutline: state.documentOutline,
    promptOverride: config.promptOverrides?.writer,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('draft', chunk));
  return agent.execute(state);
}

export async function runAiReviewStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('ai_review', '🔎 AI 正在进行质量审查...');
  const agent = new ReviewerAgent(config.provider, {
    mode: 'ai_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.aiReview'],
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('ai_review', chunk));
  return agent.execute(state);
}

export async function runPostEditReviewStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('post_edit_review', '🔎 AI 正在进行编辑后审查...');
  const agent = new ReviewerAgent(config.provider, {
    mode: 'post_edit_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.postEditReview'],
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('post_edit_review', chunk));
  return agent.execute(state);
}

export async function runLocalizeStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  const langLabel = state.targetLanguage === 'zh-TW' ? '繁體中文（台灣）' :
    state.targetLanguage === 'en' ? 'English（英文）' : '简体中文';
  config.onProgress?.('localize', `🌐 AI 正在本地化为 ${langLabel}...`);
  // Long-output stage: give reasoning models (e.g. DeepSeek thinking variants)
  // enough budget so the answer isn't starved by the thinking phase (128k).
  const agent = new LocalizerAgent(config.provider, {
    signal: config.signal,
    maxTokens: 128000,
    promptOverride: config.promptOverrides?.localizer,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('localize', chunk));
  return agent.execute(state);
}

export async function runLocalizeAiReviewStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('localize_ai_review', '🔎 AI 正在审查本地化质量...');
  const agent = new ReviewerAgent(config.provider, {
    mode: 'localize_ai_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.localizeAiReview'],
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('localize_ai_review', chunk));
  return agent.execute(state);
}

/**
 * Build DITA XML from localized drafts (falls back to original drafts when no
 * localized drafts exist). The generated XML is stored as DocumentDraft objects
 * whose `content` is the raw DITA XML text, so the subsequent review stages can
 * treat them like any other draft (ReviewPanel editing, AI review, etc.).
 *
 * This stage does NOT write files or complete the workflow — that happens in
 * runExportStage after the user has reviewed/edited the DITA XML.
 */
export async function runDitaBuildStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('dita_build', '📦 正在生成 DITA XML 文档...');
  const sourceDrafts = state.localizedDrafts.length > 0 ? state.localizedDrafts : state.drafts;
  const ditaDocuments: DocumentDraft[] = [];
  const now = new Date().toISOString();

  for (const draft of sourceDrafts) {
    try {
      config.onProgress?.('dita_build', `转换文档: ${draft.title}`);
      const xml = buildDitaXml(draft);
      // M8: well-formedness check — surface structural problems immediately
      // instead of relying on the AI review stage to catch them.
      const { valid, errors } = validateDitaXml(xml);
      if (!valid) {
        config.onProgress?.('dita_build', `⚠ DITA 校验警告: ${draft.title} - ${errors.join('; ')}`);
        log.warn('[WF][Pipeline] DITA validation failed for draft', { title: draft.title, errors });
      }
      ditaDocuments.push({
        id: uuidv4(),
        title: draft.title,
        content: xml,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      log.error('DITA build error for draft', draft.title, err);
      config.onProgress?.('dita_build', `❌ DITA 生成失败: ${draft.title} - ${String(err)}`);
    }
  }

  config.onProgress?.('dita_build', `✅ 成功生成 ${ditaDocuments.length} 个 DITA 文档`, ditaDocuments);
  return { ditaDocuments };
}

export async function runDitaAiReviewStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('dita_ai_review', '🔎 AI 正在审查 DITA XML 结构...');
  const agent = new ReviewerAgent(config.provider, {
    mode: 'dita_ai_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.ditaAiReview'],
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('dita_ai_review', chunk));
  return agent.execute(state);
}

export async function runExportStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('export', '💾 正在写入 DITA / DOCX 文件...');
  // Prefer reviewed/edited DITA documents; fall back to building from drafts.
  let ditaDocs = state.ditaDocuments;
  if (ditaDocs.length === 0) {
    config.onProgress?.('export', '未找到已生成的 DITA 文档，从草稿重新生成...');
    const sourceDrafts = state.localizedDrafts.length > 0 ? state.localizedDrafts : state.drafts;
    const now = new Date().toISOString();
    ditaDocs = sourceDrafts.map((d) => ({
      id: uuidv4(),
      title: d.title,
      content: buildDitaXml(d),
      createdAt: now,
      updatedAt: now,
    }));
  }

  const outputDocuments: OutputDocument[] = [];
  const now = new Date().toISOString();
  for (const doc of ditaDocs) {
    const safeName = doc.title.replace(/[/\\?%*:|"<>]/g, '-');
    try {
      config.onProgress?.('export', `写入 DITA 文件: ${doc.title}`);
      // M8: validate before writing — flag malformed XML instead of shipping it.
      const { valid, errors } = validateDitaXml(doc.content);
      if (!valid) {
        config.onProgress?.('export', `⚠ DITA 校验警告: ${doc.title} - ${errors.join('; ')}`);
        log.warn('[WF][Pipeline] Export DITA validation failed', { title: doc.title, errors });
      }
      const buffer = Buffer.from(doc.content, 'utf-8');
      const fileName = `${safeName}.dita`;
      const filePath = writeProjectBinaryFile(state.projectId, fileName, buffer);
      outputDocuments.push({
        id: uuidv4(),
        title: doc.title,
        fileName,
        filePath,
        format: 'dita',
        size: buffer.length,
        createdAt: now,
      });
    } catch (err) {
      log.error('Export error for DITA doc', doc.title, err);
      config.onProgress?.('export', `❌ DITA 导出失败: ${doc.title} - ${String(err)}`);
    }

    // M2: also produce a Word (.docx) version of each document.
    try {
      config.onProgress?.('export', `生成 DOCX 文件: ${doc.title}`);
      const docxBuffer = await buildDocx(doc);
      const docxName = `${safeName}.docx`;
      const docxPath = writeProjectBinaryFile(state.projectId, docxName, docxBuffer);
      outputDocuments.push({
        id: uuidv4(),
        title: doc.title,
        fileName: docxName,
        filePath: docxPath,
        format: 'docx',
        size: docxBuffer.length,
        createdAt: now,
      });
    } catch (err) {
      log.error('Export error for DOCX doc', doc.title, err);
      config.onProgress?.('export', `❌ DOCX 导出失败: ${doc.title} - ${String(err)}`);
    }
  }

  config.onProgress?.('export', `✅ 成功导出 ${outputDocuments.length} 个文档 (DITA + DOCX)`, outputDocuments);
  return { outputDocuments, status: 'COMPLETED', currentStage: 'export' };
}
