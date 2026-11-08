import type { DocGenState } from '../../../shared/types/workflow.types';
import type { AIProvider, AIStreamChunk } from '../ai-providers/base.provider';
import type { DocumentSearchService } from '../rag/local-search.service';
import { FileParserAgent } from '../agents/file-parser.agent';
import { AnalyzerAgent } from '../agents/analyzer.agent';
import { WriterAgent } from '../agents/writer.agent';
import { ReviewerAgent } from '../agents/reviewer.agent';
import { createReader } from '../file-readers';
import { buildDitaXml, validateAndRepairDitaXml, validateDitaXml } from '../document-builder/dita.builder';
import { buildDocx } from '../document-builder/docx.builder';
import { ditaToMarkdown } from '../document-builder/dita-to-markdown';
import { writeProjectBinaryFile } from '../storage/file-storage';
import { v4 as uuidv4 } from 'uuid';
import type { OutputDocument, UploadedFile, DocumentDraft } from '../../../shared/types/document.types';
import type { StageName } from '../../../shared/types/workflow.types';
import type { PromptOverrides } from '../prompts';
import type { GlossaryService } from '../glossary/glossary.service';
import type { GlossaryTermCandidate } from '../../../shared/types/document.types';
import log from 'electron-log';
import { en as ui, formatUi } from '../../../shared/i18n';
import { fileExtractionToMarkdown } from '../../../shared/utils/artifact-markdown';

export type ProgressCallback = (stage: StageName, message: string, data?: unknown) => void;
export type StreamCallback = (stage: StageName, chunk: AIStreamChunk) => void;

/** Glossary hits after the human review panel (removed entries are dropped, P3). */
export function activeGlossaryHits(state: DocGenState) {
  return (state.glossaryHits ?? []).filter((hit) => hit.userState !== 'removed');
}

export interface PipelineConfig {
  provider: AIProvider;
  ragService: DocumentSearchService;
  /** AbortSignal from the graph invoke — lets pause/go-back cancel LLM calls. */
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  onStream?: StreamCallback;
  /** 用户配置的提示词覆盖（按提示词键），应用到各 Agent 的 system prompt。 */
  promptOverrides?: PromptOverrides;
  /** 术语库匹配服务（P3）：为 analyze/draft/review 注入命中的术语。 */
  glossary?: GlossaryService;
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
  // P4-3: run the deterministic matcher on the ingest context *before* the
  // analysis so the analytical summary already uses the approved wording.
  let analyzeGlossaryBlock = '';
  if (config.glossary && state.useGlossary !== false) {
    try {
      const context = config.glossary.buildAnalyzeContext(state.ingestContext ?? '');
      if (context.text) {
        analyzeGlossaryBlock = context.text;
        config.onProgress?.(
          'analyze',
          `📚 ${context.count} glossary entries injected into the analysis prompt`
        );
      }
    } catch (err) {
      log.warn('[WF][Pipeline] analyze glossary context failed:', err);
    }
  }
  const agent = new AnalyzerAgent(config.provider, {
    onProgress: (msg) => config.onProgress?.('analyze', msg),
    signal: config.signal,
    promptOverride: config.promptOverrides?.analyzer,
    promptOverrides: config.promptOverrides,
    glossaryBlock: analyzeGlossaryBlock,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('analyze', chunk));
  config.onProgress?.('analyze', `🤖 ${ui.workflow.pipeline.deepAnalyze}`);
  const updates = await agent.execute(stateWithRefs);

  // P3-2: resolve the glossary for the source material and hand the tiered
  // hits to the writer/review stages via the graph state.
  if (config.glossary && state.useGlossary !== false) {
    try {
      const analysisResults = updates.analysisResults ?? state.analysisResults;
      const synthesis = updates.analysisSynthesisMarkdown ?? state.analysisSynthesisMarkdown;
      const terms: GlossaryTermCandidate[] = state.inputFiles.flatMap(
        (file) => file.parseExtraction?.terms ?? []
      );
      const sourceText = [
        state.ingestContext,
        ...analysisResults.map((result) => result.markdown ?? ''),
        synthesis ?? '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const resolved = await config.glossary.resolveForWriting({
        text: sourceText,
        terms,
        provider: config.provider,
        signal: config.signal,
        promptOverrides: config.promptOverrides,
        onProgress: (message) => config.onProgress?.('analyze', message),
      });
      const glossaryVersion = config.glossary.getVersion();
      config.onProgress?.('analyze', `📚 Glossary v${glossaryVersion}: A=${resolved.hits.filter((h) => h.tier === 'A').length} B=${resolved.hits.filter((h) => h.tier === 'B').length}`);
      return { ...updates, glossaryHits: resolved.hits, glossaryVersion };
    } catch (err) {
      // Glossaries are an enhancement: never fail the workflow over them.
      log.warn('[WF][Pipeline] glossary resolution failed:', err);
    }
  }
  return updates;
}

export async function runDraftStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('draft', `✍️ ${ui.workflow.pipeline.aiDraft}`);
  // P3-2: reuse the human-confirmed hits from `analyze` (no re-matching) and
  // render the approved-terminology block for the writer.
  const hits = activeGlossaryHits(state);
  let glossaryBlock = '';
  if (config.glossary && state.useGlossary !== false && hits.length > 0) {
    const block = config.glossary.buildPromptBlock('writing', hits);
    glossaryBlock = block.text;
    if (glossaryBlock) {
      config.onProgress?.('draft', `📚 ${hits.length} glossary entries injected (${block.tokens} tokens${block.truncated ? `, ${block.truncated} truncated` : ''})`);
    }
  }
  const agent = new WriterAgent(config.provider, {
    signal: config.signal,
    documentOutline: state.documentOutline,
    promptOverride: config.promptOverrides?.writer,
    glossaryBlock,
    // P4-8: on-demand glossary lookup (opt-in, needs provider tool support).
    glossaryLookup:
      config.glossary &&
      state.useGlossary !== false &&
      config.glossary.getSettings().writerToolLookup &&
      typeof config.provider.completeWithTools === 'function'
        ? (query, limit) => config.glossary!.lookupForTool(query, limit)
        : undefined,
  });
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('draft', chunk));
  return agent.execute(state);
}

export async function runAiReviewStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {
  config.onProgress?.('ai_review', `🔎 ${ui.workflow.pipeline.aiReview}`);
  const review = buildReviewGlossary(state, config, state.drafts);
  const agent = new ReviewerAgent(config.provider, {
    mode: 'ai_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.aiReview'],
    glossaryBlock: review.block,
    ruleComments: review.comments,
    chunkThresholdChars: review.chunkThreshold,
  });
  if (review.comments.length > 0) {
    config.onProgress?.('ai_review', `📚 ${review.comments.length} deterministic glossary issues`);
  }
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
  const review = buildReviewGlossary(state, config, state.ditaDocuments);
  const agent = new ReviewerAgent(config.provider, {
    mode: 'dita_ai_review',
    signal: config.signal,
    promptOverride: config.promptOverrides?.['reviewer.ditaAiReview'],
    glossaryBlock: review.block,
    ruleComments: review.comments,
    chunkThresholdChars: review.chunkThreshold,
  });
  if (review.comments.length > 0) {
    config.onProgress?.('dita_ai_review', `📚 ${review.comments.length} deterministic glossary issues`);
  }
  if (config.onStream) agent.setStreamCallback((chunk) => config.onStream?.('dita_ai_review', chunk));
  return agent.execute(state);
}

/**
 * Build the review scenario glossary block + deterministic rule comments for
 * the documents being reviewed (P3-4 / design §2.8).
 */
function buildReviewGlossary(
  state: DocGenState,
  config: PipelineConfig,
  documents: DocumentDraft[]
): { block: string; comments: import('../../../shared/types/document.types').ReviewComment[]; chunkThreshold: number } {
  const glossary = config.glossary;
  const hits = activeGlossaryHits(state);
  if (!glossary || state.useGlossary === false || hits.length === 0) {
    return { block: '', comments: [], chunkThreshold: 0 };
  }
  const block = glossary.buildPromptBlock('review', hits).text;
  const sourceText = [
    state.ingestContext,
    ...state.analysisResults.map((result) => result.markdown ?? result.summary ?? ''),
    state.analysisSynthesisMarkdown ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const comments = documents.flatMap((doc) => [
    // P4-6: forbidden wording check runs first — a ``Do not use'' hit is a
    // more precise finding than a generic "term missing" warning.
    ...glossary.checkForbidden(doc.content, doc.id),
    ...glossary.checkDraft(doc.content, sourceText, hits, doc.id),
  ]);
  return {
    block,
    comments,
    chunkThreshold: glossary.getSettings().chunkThresholdChars.review,
  };
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

  // P4-4: pre-export terminology usage report (deterministic, no tokens).
  if (config.glossary && state.useGlossary !== false) {
    try {
      const hits = activeGlossaryHits(state);
      if (hits.length > 0) {
        const combined = ditaDocs.map((doc) => doc.content).join('\n\n');
        const report = config.glossary.buildUsageReport(combined, hits);
        config.onProgress?.(
          'export',
          `📊 Glossary usage: ${report.used}/${report.total} used · ${report.variantOnly} variant · ${report.missing} missing${
            report.forbidden > 0 ? ` · ⛔ ${report.forbidden} forbidden` : ''
          }`
        );
        log.info('[WF][Pipeline] glossary usage report', {
          projectId: state.projectId,
          total: report.total,
          used: report.used,
          variantOnly: report.variantOnly,
          missing: report.missing,
          forbidden: report.forbidden,
        });
      }
    } catch (err) {
      log.warn('[WF][Pipeline] glossary usage report failed:', err);
    }
  }

  for (const doc of ditaDocs) {
    const safeName = doc.title.replace(/[/\\?%*:|"<>]/g, '-');
    // Normalise element-name casing and repair trivial XML issues before
    // writing: AI-edited DITA can contain `<Section>`/`<Table>`, which is not
    // valid DITA and used to make the exported (and split) files fail
    // validation.
    const finalized = validateAndRepairDitaXml(doc.content);
    try {
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.writeDita, { title: doc.title }));
      // M8: validate before writing — flag malformed XML instead of shipping it.
      if (!finalized.valid) {
        config.onProgress?.('export', formatUi(ui.workflow.pipeline.validationWarning, { title: doc.title, errors: finalized.errors.join('; ') }));
        log.warn('[WF][Pipeline] Export DITA validation failed', { title: doc.title, errors: finalized.errors });
      }
      const buffer = Buffer.from(finalized.content, 'utf-8');
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
        documentId: doc.id,
      });
    } catch (err) {
      log.error('Export error for DITA doc', doc.title, err);
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.ditaExportFailed, { title: doc.title, error: String(err) }));
    }

    // M2: also produce a Word (.docx) version of each document.
    try {
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.writeDocx, { title: doc.title }));
      // S3-1: `buildDocx` expects Markdown — convert the DITA XML first instead
      // of feeding raw XML to the Markdown parser (previously the DOCX body was
      // a literal dump of the XML document).
      const docxBuffer = await buildDocx({ ...doc, content: ditaToMarkdown(finalized.content) });
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
        documentId: doc.id,
      });
    } catch (err) {
      log.error('Export error for DOCX doc', doc.title, err);
      config.onProgress?.('export', formatUi(ui.workflow.pipeline.docxExportFailed, { title: doc.title, error: String(err) }));
    }
  }

  config.onProgress?.('export', `✅ ${formatUi(ui.workflow.pipeline.exported, { count: outputDocuments.length })}`, outputDocuments);
  return { outputDocuments, status: 'COMPLETED', currentStage: 'export' };
}
