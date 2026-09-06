import type { DocGenState } from '../../../shared/types/workflow.types';
import type { AIProvider, AIStreamChunk } from '../ai-providers/base.provider';
import type { DocumentSearchService } from '../rag/local-search.service';
import { FileParserAgent } from '../agents/file-parser.agent';
import { AnalyzerAgent } from '../agents/analyzer.agent';
import { WriterAgent } from '../agents/writer.agent';
import { ReviewerAgent } from '../agents/reviewer.agent';
import { createReader } from '../file-readers';
import { buildDitaXml, validateDitaXml } from '../document-builder/dita.builder';
import { buildDocx } from '../document-builder/docx.builder';
import { writeProjectBinaryFile } from '../storage/file-storage';
import { v4 as uuidv4 } from 'uuid';
import type { OutputDocument, UploadedFile, DocumentDraft } from '../../../shared/types/document.types';
import type { StageName } from '../../../shared/types/workflow.types';
import type { PromptOverrides } from '../prompts';
import log from 'electron-log';
import { en as ui, formatUi } from '../../../shared/i18n';
import { fileExtractionToMarkdown } from '../../../shared/utils/artifact-markdown';

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
  config.onProgress?.('upload_parse', `📂 ${ui.workflow.pipeline.startReading}`);
  const updatedFiles: UploadedFile[] = [];

  for (const file of state.inputFiles) {
    if (file.parseStatus !== 'pending') {
      updatedFiles.push(file);
      continue;
    }
    try {
      config.onProgress?.('upload_parse', formatUi(ui.workflow.pipeline.readFile, { file: file.name }));
      const reader = createReader(file.path);
      const result = await reader.read(file.path);
      config.onProgress?.('upload_parse', formatUi(ui.workflow.pipeline.fileReadComplete, { file: file.name, count: result.text.length }));
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
  config.onProgress?.('upload_parse', `🤖 ${ui.workflow.pipeline.aiParse}`);
  return agent.execute(agentState);
}

/**
 * Ingest stage (M7): aggregates the parsed files into a single structured
 * context consumed by the analyze stage. Previously this was a counting
 * no-op; now it produces `ingestContext` as a Markdown evidence bundle. The
 * analyzer receives this artifact verbatim so the complete reviewed
 * extraction, rather than a regenerated summary, is carried downstream.
 */
export async function runIngestStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('ingest', `📥 ${ui.workflow.pipeline.assemble}`);
  const readyFiles = state.inputFiles.filter((f) => f.parseStatus === 'done');
  const errorFiles = state.inputFiles.filter((f) => f.parseStatus === 'error');
  config.onProgress?.('ingest', formatUi(ui.workflow.pipeline.readyFiles, {
    ready: readyFiles.length,
    errors: errorFiles.length > 0 ? formatUi(ui.workflow.pipeline.errorFiles, { count: errorFiles.length }) : '',
  }));

  const sections = readyFiles.map((f) => {
    const markdown = f.parseMarkdown || f.parseExtraction?.markdown || fileExtractionToMarkdown(f.parseExtraction, f);
    return `<!-- smart-tech-writer:source-file:${f.id} -->\n\n${markdown}`;
  });
  const ingestContext = sections.join('\n\n---\n\n');

  config.onProgress?.('ingest', `✅ ${formatUi(ui.workflow.pipeline.aggregated, { count: readyFiles.length, characters: ingestContext.length })}`);
  log.info(`Ingest: ${readyFiles.length} files ready, context ${ingestContext.length} chars`);
  return { ingestContext };
}

export async function runAnalyzeStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('analyze', `🔍 ${ui.workflow.pipeline.aiAnalyze}`);
  // First run local search for reference materials
  const searchQuery = state.inputFiles
    .filter((f) => f.parseStatus === 'done')
    .map((f) => f.parseSummary ?? f.name)
    .join(' ') || 'technical documentation';

  config.onProgress?.('analyze', formatUi(ui.workflow.pipeline.searchReferences, { query: searchQuery.slice(0, 80) }));
  const refResults = await config.ragService.search(searchQuery);
  config.onProgress?.('analyze', formatUi(ui.workflow.pipeline.foundReferences, { count: refResults.length }), refResults);

  const stateWithRefs = { ...state, referenceSearchResults: refResults };
  const agent = new AnalyzerAgent(config.provider, {
    onProgress: (msg) => config.onProgress?.('analyze', msg),
    signal: config.signal,
    promptOverride: config.promptOverrides?.analyzer,
    promptOverrides: config.promptOverrides,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('analyze', chunk));
  config.onProgress?.('analyze', `🤖 ${ui.workflow.pipeline.deepAnalyze}`);
  return agent.execute(stateWithRefs);
}

export async function runDraftStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('draft', `✍️ ${ui.workflow.pipeline.aiDraft}`);
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
  config.onProgress?.('ai_review', `🔎 ${ui.workflow.pipeline.aiReview}`);
  const agent = new ReviewerAgent(config.provider, {
    mode: 'ai_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.aiReview'],
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('ai_review', chunk));
  return agent.execute(state);
}

/**
 * Build DITA XML from the reviewed English drafts. The generated XML is stored as DocumentDraft objects
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
  config.onProgress?.('dita_build', `📦 ${ui.workflow.pipeline.generateDita}`);
  const sourceDrafts = state.drafts;
  const ditaDocuments: DocumentDraft[] = [];
  const now = new Date().toISOString();

  for (const draft of sourceDrafts) {
    try {
      config.onProgress?.('dita_build', formatUi(ui.workflow.pipeline.convertDocument, { title: draft.title }));
      const xml = buildDitaXml(draft);
      // M8: well-formedness check — surface structural problems immediately
      // instead of relying on the AI review stage to catch them.
      const { valid, errors } = validateDitaXml(xml);
      if (!valid) {
        config.onProgress?.('dita_build', formatUi(ui.workflow.pipeline.validationWarning, { title: draft.title, errors: errors.join('; ') }));
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
      config.onProgress?.('dita_build', formatUi(ui.workflow.pipeline.ditaBuildFailed, { title: draft.title, error: String(err) }));
    }
  }

  config.onProgress?.('dita_build', `✅ ${formatUi(ui.workflow.pipeline.generatedDita, { count: ditaDocuments.length })}`, ditaDocuments);
  return { ditaDocuments };
}

export async function runDitaAiReviewStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('dita_ai_review', `🔎 ${ui.workflow.pipeline.ditaAiReview}`);
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
  config.onProgress?.('export', `💾 ${ui.workflow.pipeline.writeFiles}`);
  // Prefer reviewed/edited DITA documents; fall back to building from drafts.
  let ditaDocs = state.ditaDocuments;
  if (ditaDocs.length === 0) {
    config.onProgress?.('export', ui.workflow.pipeline.rebuildDita);
    const sourceDrafts = state.drafts;
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
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.writeDita, { title: doc.title }));
      // M8: validate before writing — flag malformed XML instead of shipping it.
      const { valid, errors } = validateDitaXml(doc.content);
      if (!valid) {
        config.onProgress?.('export', formatUi(ui.workflow.pipeline.validationWarning, { title: doc.title, errors: errors.join('; ') }));
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
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.ditaExportFailed, { title: doc.title, error: String(err) }));
    }

    // M2: also produce a Word (.docx) version of each document.
    try {
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.writeDocx, { title: doc.title }));
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
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.docxExportFailed, { title: doc.title, error: String(err) }));
    }
  }

  config.onProgress?.('export', `✅ ${formatUi(ui.workflow.pipeline.exported, { count: outputDocuments.length })}`, outputDocuments);
  return { outputDocuments, status: 'COMPLETED', currentStage: 'export' };
}
