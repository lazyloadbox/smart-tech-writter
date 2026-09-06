import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import type { AIProvider, AIStreamChunk } from '../ai-providers/base.provider';
import { DitaLocalizerAgent } from '../agents/dita-localizer.agent';
import { DitaReviewerAgent } from '../agents/dita-reviewer.agent';
import {
  loadPromptOverrides,
  buildAiEditArtifactSystemPrompt,
  buildAiEditArtifactUserPrompt,
  stripAiArtifactEnvelope,
} from '../prompts';
import type { AiArtifactFormat } from '../../../shared/types/ipc.types';
import { validateAndRepairDitaXml } from '../document-builder/dita.builder';
import type { LocalizeLanguage, DocumentDraft } from '../../../shared/types/document.types';
import type {
  LocalizationFileResult,
  LocalizationStage,
  LocalizationStatus,
  LocalizeRun,
  LocalizeRunState,
} from '../../../shared/types/localization.types';
import { getDatabase } from '../storage/database';
import { v4 as uuidv4 } from 'uuid';
import { MappingService } from './mapping.service';

export interface LocalizationEmitter {
  onProgress: (event: {
    stage: LocalizationStage;
    fileName: string;
    index: number;
    total: number;
    status: 'started' | 'done' | 'failed';
    message?: string;
  }) => void;
  onStream: (event: { fileName: string; chunk: AIStreamChunk }) => void;
}

/** Compute the export file name: `<basename>.<lang>.dita`. */
function getExportFileName(fileName: string, lang: LocalizeLanguage): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  return `${base}.${lang}${ext}`;
}

/**
 * Standalone DITA localization service.
 *
 * Replicates the localization portion of the document-generation workflow:
 *
 *   localize (AI 翻译) → review_localize (人工审阅) → localize_ai_review (AI 评审)
 *   → human_localize_review (人工接受/拒绝建议 + 编辑) → post_edit_review (AI 修改建议)
 *   → human_confirm (人工最终确认) → export (导出)
 *
 * Each run is persisted to the `localization_runs` table (full results + stage +
 * status) so runs survive restarts and can be reopened/continued from the
 * overview. Results are written to disk on demand via exportTo().
 */
export class LocalizationService {
  private provider: AIProvider;
  private mappingService: MappingService;
  private results: LocalizationFileResult[] = [];
  private stage: LocalizationStage = 'localize';
  private status: LocalizationStatus = 'idle';
  private targetLanguage: LocalizeLanguage = 'zh-CN';
  private running = false;
  /** Current run id (persisted to the localization_runs table). */
  private runId: string | null = null;

  constructor(provider: AIProvider, mappingService?: MappingService) {
    this.provider = provider;
    this.mappingService = mappingService ?? new MappingService();
  }

  /** Hot-swap the AI provider (settings reload). */
  updateProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /** Hot-swap the mapping service (used by tests / future wiring). */
  updateMappingService(mappingService: MappingService): void {
    this.mappingService = mappingService;
  }

  getStatus(): LocalizationStatus {
    return this.status;
  }

  getStage(): LocalizationStage {
    return this.stage;
  }

  getResults(): LocalizationFileResult[] {
    return this.results;
  }

  getRunId(): string | null {
    return this.runId;
  }

  // ─── Persistence (localization_runs table) ───

  /** Write the current run state to the localization_runs table. */
  private persist(): void {
    if (!this.runId) return;
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const state = {
        status: this.status,
        stage: this.stage,
        targetLanguage: this.targetLanguage,
        results: this.results,
      };
      db.prepare(`
        INSERT OR REPLACE INTO localization_runs (id, status, stage, target_language, state_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM localization_runs WHERE id = ?), ?), ?)
      `).run(
        this.runId,
        this.status,
        this.stage,
        this.targetLanguage,
        JSON.stringify(state),
        this.runId,
        now,
        now
      );
    } catch (err) {
      log.error('[Localize] persist failed:', err);
    }
  }

  /** List persisted runs (newest first) — summaries only, no full results. */
  listRuns(): LocalizeRun[] {
    try {
      const db = getDatabase();
      const rows = db
        .prepare('SELECT id, status, stage, target_language, state_json, created_at, updated_at FROM localization_runs ORDER BY updated_at DESC')
        .all() as {
        id: string; status: string; stage: string; target_language: string;
        state_json: string | null; created_at: string; updated_at: string;
      }[];
      return rows.map((r) => {
        let fileCount = 0;
        try {
          const state = JSON.parse(r.state_json ?? '{}') as { results?: unknown[] };
          fileCount = Array.isArray(state.results) ? state.results.length : 0;
        } catch { /* ignore malformed state */ }
        return {
          id: r.id,
          status: r.status as LocalizationStatus,
          stage: r.stage as LocalizationStage,
          targetLanguage: r.target_language as LocalizeLanguage,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          fileCount,
        };
      });
    } catch (err) {
      log.error('[Localize] listRuns failed:', err);
      return [];
    }
  }

  /** Fetch a full persisted run state (results included). */
  getRun(runId: string): LocalizeRunState | null {
    try {
      const db = getDatabase();
      const row = db
        .prepare('SELECT id, status, stage, target_language, state_json, created_at, updated_at FROM localization_runs WHERE id = ?')
        .get(runId) as
        | { id: string; status: string; stage: string; target_language: string; state_json: string | null; created_at: string; updated_at: string }
        | undefined;
      if (!row) return null;
      const state = JSON.parse(row.state_json ?? '{}') as {
        status?: LocalizationStatus;
        stage?: LocalizationStage;
        targetLanguage?: LocalizeLanguage;
        results?: LocalizationFileResult[];
      };
      const results = Array.isArray(state.results) ? state.results : [];
      return {
        id: row.id,
        status: state.status ?? (row.status as LocalizationStatus),
        stage: state.stage ?? (row.stage as LocalizationStage),
        targetLanguage: state.targetLanguage ?? (row.target_language as LocalizeLanguage),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        fileCount: results.length,
        results,
      };
    } catch (err) {
      log.error('[Localize] getRun failed:', err);
      return null;
    }
  }

  /** Restore a persisted run into the service (replaces current in-memory state). */
  loadRun(runId: string): LocalizeRunState | null {
    const run = this.getRun(runId);
    if (!run) {
      log.warn('[Localize] loadRun: run not found', { runId });
      return null;
    }
    this.runId = runId;
    this.status = run.status;
    this.stage = run.stage;
    this.targetLanguage = run.targetLanguage;
    this.results = run.results;
    this.running = false;
    log.info('[Localize] loadRun applied', { runId, stage: run.stage, status: run.status, fileCount: run.fileCount });
    return run;
  }

  /** Delete a persisted run (and detach it if it is the active run). */
  deleteRun(runId: string): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM localization_runs WHERE id = ?').run(runId);
      if (this.runId === runId) this.runId = null;
      log.info('[Localize] deleteRun', { runId });
    } catch (err) {
      log.error('[Localize] deleteRun failed:', err);
    }
  }

  /**
   * Stage 1 — AI 生成：translate a batch of .dita files into the target language.
   * Fire-and-forget from the IPC layer; progress/stream events are emitted
   * through the provided emitter. On success moves to `review_localize`.
   */
  async startTranslation(
    filePaths: string[],
    targetLanguage: LocalizeLanguage,
    emitter: LocalizationEmitter
  ): Promise<void> {
    if (this.running) {
      log.warn('[Localize] startTranslation ignored — already running');
      return;
    }
    this.running = true;
    this.status = 'running';
    this.stage = 'localize';
    this.targetLanguage = targetLanguage;
    this.runId = uuidv4();
    this.results = [];
    const total = filePaths.length;
    const promptOverrides = loadPromptOverrides();
    // Extract the glossary relevant to the target language once for the whole
    // run and inject it into the translation prompt so the AI reuses the
    // established terminology.
    const mapping = this.mappingService.getMappingContext(targetLanguage);
    if (mapping.count > 0) {
      log.info('[Localize] translation mapping loaded', { targetLanguage, entries: mapping.count });
    }

    try {
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const fileName = path.basename(filePath);
        emitter.onProgress({ stage: 'localize', fileName, index: i, total, status: 'started' });

        try {
          const originalContent = fs.readFileSync(filePath, 'utf-8');
          const agent = new DitaLocalizerAgent(this.provider, {
            promptOverride: promptOverrides.ditaLocalizer,
            maxTokens: 128000,
          });
          agent.setStreamCallback((chunk) => {
            emitter.onStream({ fileName, chunk });
          });

          const translated = await agent.translateDita(originalContent, targetLanguage, mapping.text);
          // Validate the translation and auto-repair common XML issues
          // (unescaped `&`/`<`, unclosed tags) so the result is well-formed.
          const v = validateAndRepairDitaXml(translated);
          if (!v.valid) {
            log.warn('[Localize] translated DITA failed validation', {
              fileName,
              errors: v.errors.slice(0, 5),
            });
          } else if (v.repaired) {
            log.warn('[Localize] translated DITA auto-repaired', { fileName });
          }

          this.results.push({
            sourcePath: filePath,
            fileName,
            exportFileName: getExportFileName(fileName, targetLanguage),
            targetLanguage,
            originalContent,
            aiContent: translated,
            content: v.content,
            status: 'done',
            validated: v.valid,
            repaired: v.repaired,
            validationErrors: v.errors,
            reviewComments: [],
            postEditComments: [],
          });
          emitter.onProgress({ stage: 'localize', fileName, index: i, total, status: 'done' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('[Localize] translation failed', { fileName, error: message });
          this.results.push({
            sourcePath: filePath,
            fileName,
            exportFileName: getExportFileName(fileName, targetLanguage),
            targetLanguage,
            originalContent: '',
            aiContent: '',
            content: '',
            status: 'failed',
            error: message,
            validated: false,
            reviewComments: [],
            postEditComments: [],
          });
          emitter.onProgress({ stage: 'localize', fileName, index: i, total, status: 'failed', message });
        }
      }

      if (this.results.some((r) => r.status === 'failed')) {
        this.status = 'failed';
      } else {
        this.stage = 'review_localize';
        this.status = 'paused:review_localize';
      }
      this.persist();
    } finally {
      this.running = false;
    }
  }

  /**
   * Stage 3 — AI review：apply any manual edits made during `review_localize`,
   * then review the translation quality of every localized file against its
   * original, producing per-file ReviewComment[].
   * On success moves to `human_localize_review`.
   */
  async continueFromReviewLocalize(editedDrafts: DocumentDraft[], emitter: LocalizationEmitter): Promise<void> {
    if (this.running) {
      log.warn('[Localize] continueFromReviewLocalize ignored — already running');
      return;
    }
    this.applyEdits(editedDrafts);
    this.running = true;
    this.status = 'running';
    this.stage = 'localize_ai_review';
    const promptOverrides = loadPromptOverrides();
    const mapping = this.mappingService.getMappingContext(this.targetLanguage);
    const done = this.results.filter((r) => r.status === 'done');
    const total = done.length;

    try {
      for (let i = 0; i < done.length; i++) {
        const r = done[i];
        emitter.onProgress({ stage: 'localize_ai_review', fileName: r.fileName, index: i, total, status: 'started' });
        try {
          const agent = new DitaReviewerAgent(this.provider, {
            mode: 'localize_ai_review',
            promptOverride: promptOverrides?.['reviewer.localizeAiReview'],
            maxTokens: 128000,
          });
          agent.setStreamCallback((chunk) => {
            emitter.onStream({ fileName: r.fileName, chunk });
          });
          r.reviewComments = await agent.review(r.content, r.originalContent, r.targetLanguage, r.sourcePath, mapping.text);
          emitter.onProgress({ stage: 'localize_ai_review', fileName: r.fileName, index: i, total, status: 'done' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('[Localize] localize_ai_review failed', { fileName: r.fileName, error: message });
          r.reviewComments = [{ id: uuidv4(), draftId: r.sourcePath, type: 'info', explanation: message, accepted: false }];
          emitter.onProgress({ stage: 'localize_ai_review', fileName: r.fileName, index: i, total, status: 'failed', message });
        }
      }
      this.stage = 'human_localize_review';
      this.status = 'paused:human_localize_review';
      this.persist();
    } finally {
      this.running = false;
    }
  }

  /**
   * Stage 5 — AI 修改建议：apply the human edits from `human_localize_review`,
   * then run a post-edit AI review producing per-file postEditComments.
   * On success moves to `human_confirm`.
   */
  async submitHumanLocalizeReview(
    editedDrafts: DocumentDraft[],
    acceptedCommentIds: string[],
    emitter: LocalizationEmitter
  ): Promise<void> {
    if (this.running) {
      log.warn('[Localize] submitHumanLocalizeReview ignored — already running');
      return;
    }
    this.applyEdits(editedDrafts);
    this.markAcceptedComments(acceptedCommentIds, 'reviewComments');
    // Remember the post-human-review content so a later go-back to
    // post_edit_review can restore it (instead of losing the edits).
    for (const r of this.results) {
      if (r.status === 'done') r.humanLocalizeContent = r.content;
    }
    this.running = true;
    this.status = 'running';
    this.stage = 'post_edit_review';
    const promptOverrides = loadPromptOverrides();
    const mapping = this.mappingService.getMappingContext(this.targetLanguage);
    const done = this.results.filter((r) => r.status === 'done');
    const total = done.length;

    try {
      for (let i = 0; i < done.length; i++) {
        const r = done[i];
        emitter.onProgress({ stage: 'post_edit_review', fileName: r.fileName, index: i, total, status: 'started' });
        try {
          const agent = new DitaReviewerAgent(this.provider, {
            mode: 'post_edit_review',
            promptOverride: promptOverrides?.['reviewer.postEditReview'],
            maxTokens: 128000,
          });
          agent.setStreamCallback((chunk) => {
            emitter.onStream({ fileName: r.fileName, chunk });
          });
          r.postEditComments = await agent.review(r.content, r.originalContent, r.targetLanguage, r.sourcePath, mapping.text);
          emitter.onProgress({ stage: 'post_edit_review', fileName: r.fileName, index: i, total, status: 'done' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('[Localize] post_edit_review failed', { fileName: r.fileName, error: message });
          r.postEditComments = [{ id: uuidv4(), draftId: r.sourcePath, type: 'info', explanation: message, accepted: false }];
          emitter.onProgress({ stage: 'post_edit_review', fileName: r.fileName, index: i, total, status: 'failed', message });
        }
      }
      this.stage = 'human_confirm';
      this.status = 'paused:human_confirm';
      this.persist();
    } finally {
      this.running = false;
    }
  }

  /**
   * Stage 7 — export：apply the final human edits from `human_confirm` and mark
   * the run as done (files are written on demand via exportTo).
   */
  async submitHumanConfirm(editedDrafts: DocumentDraft[], acceptedCommentIds: string[]): Promise<void> {
    if (this.running) {
      log.warn('[Localize] submitHumanConfirm ignored — already running');
      return;
    }
    this.applyEdits(editedDrafts);
    this.markAcceptedComments(acceptedCommentIds, 'postEditComments');
    this.stage = 'export';
    this.status = 'done';
    this.persist();
  }

  /**
   * Revise a localized artifact from a human confirmation step. This is kept
   * on the localization service because standalone localization runs do not
   * have a WorkflowEngine/project thread, but use the same provider and the
   * same format-safe editing contract.
   */
  async aiEditArtifact(
    currentContent: string,
    instruction: string,
    format: AiArtifactFormat,
  ): Promise<string> {
    if (!currentContent.trim()) throw new Error('The current artifact is empty.');
    if (!instruction.trim()) throw new Error('An editing instruction is required.');
    const messages = [
      { role: 'system' as const, content: buildAiEditArtifactSystemPrompt(format) },
      { role: 'user' as const, content: buildAiEditArtifactUserPrompt(instruction, currentContent, format) },
    ];
    const result = await this.provider.complete(messages, { maxTokens: 128000 });
    const cleaned = stripAiArtifactEnvelope(result, format);
    if (!cleaned) throw new Error('The AI returned no content.');
    log.info('[Localize] aiEditArtifact completed', { format, resultLen: cleaned.length });
    return cleaned;
  }

  /**
   * Go back to an earlier stage and reset the state that comes after it.
   * Supported targets: localize (re-translate), localize_ai_review (re-review),
   * post_edit_review (re-review after edits).
   */
  async goBackToStage(stage: LocalizationStage): Promise<void> {
    if (this.running) {
      log.warn('[Localize] goBackToStage ignored — already running');
      return;
    }
    if (
      stage !== 'localize' &&
      stage !== 'localize_ai_review' &&
      stage !== 'post_edit_review'
    ) {
      log.warn('[Localize] goBackToStage ignored — invalid target', { stage });
      return;
    }
    for (const r of this.results) {
      if (r.status !== 'done') continue;
      if (stage === 'post_edit_review') {
        // Restore the content as it was after human_localize_review edits.
        r.content = r.humanLocalizeContent ?? r.aiContent;
        r.postEditComments = [];
      } else {
        // Undo all human edits: restore the AI translation and clear review data.
        r.content = r.aiContent;
        r.reviewComments = [];
        r.postEditComments = [];
      }
    }
    this.stage = stage;
    if (stage === 'localize') {
      this.status = 'idle';
    } else if (stage === 'localize_ai_review') {
      this.status = 'paused:review_localize';
    } else {
      this.status = 'paused:human_localize_review';
    }
    this.persist();
    log.info('[Localize] goBackToStage', { stage, status: this.status });
  }

  /**
   * Write all successful translation results to the given directory.
   * Output file name: `<basename>.<lang>.dita` (avoids overwriting the source).
   * Each file is re-validated and auto-repaired right before writing, so the
   * exported XML is always as well-formed as possible (human edits during the
   * review stages may have broken the XML).
   * Returns the number of files written.
   */
  async exportTo(dir: string): Promise<number> {
    let count = 0;
    for (const result of this.results) {
      if (result.status !== 'done' || !result.content) continue;
      const v = validateAndRepairDitaXml(result.content);
      result.content = v.content;
      result.validated = v.valid;
      result.repaired = v.repaired;
      result.validationErrors = v.errors;
      const destPath = path.join(dir, result.exportFileName);
      fs.writeFileSync(destPath, result.content, 'utf-8');
      count++;
    }
    this.persist();
    log.info('[Localize] exportTo done', { dir, count });
    return count;
  }

  /** Apply human-edited drafts (id = sourcePath) back onto the results. */
  private applyEdits(editedDrafts: DocumentDraft[]): void {
    for (const draft of editedDrafts) {
      const result = this.results.find((r) => r.sourcePath === draft.id);
      if (result && result.status === 'done') {
        result.content = draft.content;
      }
    }
  }

  /** Mark the accepted review comments so the UI can show which were applied. */
  private markAcceptedComments(acceptedIds: string[], key: 'reviewComments' | 'postEditComments'): void {
    if (!acceptedIds || acceptedIds.length === 0) return;
    const accepted = new Set(acceptedIds);
    for (const r of this.results) {
      for (const c of r[key]) {
        if (accepted.has(c.id)) c.accepted = true;
      }
    }
  }
}
