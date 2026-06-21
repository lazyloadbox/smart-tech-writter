import { BrowserWindow } from 'electron';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import type { DocGenState, StageName, WorkflowStatus } from '../../../shared/types/workflow.types';
import type { UploadedFile } from '../../../shared/types/document.types';
import type { AIProvider } from '../ai-providers/base.provider';
import type { LocalSearchService } from '../rag/local-search.service';
import { getDatabase } from '../storage/database';
import { IPC_CHANNELS } from '../../../shared/types/ipc.types';
import {
  runUploadParseStage,
  runIngestStage,
  runAnalyzeStage,
  runDraftStage,
  runAiReviewStage,
  runPostEditReviewStage,
  runLocalizeStage,
  runLocalizeAiReviewStage,
  runDitaBuildStage,
  runDitaAiReviewStage,
  runExportStage,
} from './pipeline';
import { getStatusForStage, PAUSE_STAGES, nextStage, previousStage, getFieldsToResetAfterStage, STAGE_ORDER } from './state-machine';

export class WorkflowEngine {
  private states = new Map<string, DocGenState>();
  private pendingResume = new Map<string, (data: unknown) => void>();

  constructor(
    private provider: AIProvider,
    private ragService: LocalSearchService,
    private window: BrowserWindow
  ) {}

  updateProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  async startWorkflow(projectId: string, filePaths: string[]): Promise<DocGenState> {
    log.info('[WF][Engine] startWorkflow requested', { projectId, fileCount: filePaths.length, filePaths });
    if (filePaths.length === 0) {
      const message = 'No input files were provided to start workflow.';
      log.warn('[WF][Engine] startWorkflow rejected: empty file list', { projectId });
      throw new Error(message);
    }

    const state: DocGenState = {
      projectId,
      inputFiles: filePaths.map((p) => ({
        id: uuidv4(),
        name: path.basename(p),
        path: p,
        size: 0,
        type: path.extname(p),
        parseStatus: 'pending',
      })),
      analysisResults: [],
      referenceSearchResults: [],
      drafts: [],
      aiReviewComments: [],
      humanEdits: '',
      postEditReviewComments: [],
      localizedDrafts: [],
      localizeReviewComments: [],
      ditaDocuments: [],
      ditaReviewComments: [],
      outputDocuments: [],
      targetLanguage: 'zh-CN',
      skipLocalization: false,
      workflowLogs: [],
      currentStage: 'upload_parse',
      status: 'RUNNING',
      pipelineRunId: 1,
    };
    this.states.set(projectId, state);
    this.persistState(state);
    log.info('[WF][Engine] Initial state persisted', {
      projectId,
      stage: state.currentStage,
      status: state.status,
      inputFileCount: state.inputFiles.length,
    });

    // Run workflow asynchronously
    this.runPipeline(state).catch((err) => {
      log.error('Workflow error:', err);
      const s = this.states.get(projectId);
      if (s) {
        const errState = { ...s, status: 'FAILED' as WorkflowStatus, error: String(err) };
        this.states.set(projectId, errState);
        this.persistState(errState);
        this.emitProgress(errState, 'Workflow failed: ' + String(err));
      }
    });

    return state;
  }

  /**
   * Go back to a previous stage and re-execute from there.
   * Resets state fields produced by stages after the target stage.
   */
  async goBackToStage(projectId: string, targetStage: StageName): Promise<void> {
    log.info('[WF][Engine] goBackToStage requested', { projectId, targetStage });
    const state = this.states.get(projectId);
    if (!state) {
      log.warn('[WF][Engine] goBackToStage: project not found', { projectId });
      return;
    }

    // Validate that we're going backwards
    const currentIdx = STAGE_ORDER.indexOf(state.currentStage);
    const targetIdx = STAGE_ORDER.indexOf(targetStage);
    if (targetIdx >= currentIdx) {
      log.warn('[WF][Engine] goBackToStage: target is not before current', {
        projectId, currentStage: state.currentStage, targetStage, currentIdx, targetIdx,
      });
      return;
    }

    // Clear pending resume if any (we're abandoning the current pause)
    this.pendingResume.delete(projectId);

    // Bump pipelineRunId so any still-in-flight stage runners from the old
    // pipeline will discard their results when they eventually complete.
    const newRunId = (state.pipelineRunId ?? 0) + 1;
    log.info('[WF][Engine] goBackToStage bumping pipelineRunId', {
      projectId, oldRunId: state.pipelineRunId, newRunId,
    });

    // Get default empty values for fields to reset
    const fieldsToReset = getFieldsToResetAfterStage(targetStage);
    const humanReviewIdx = STAGE_ORDER.indexOf('human_review');
    const resetPatch: Record<string, unknown> = {
      currentStage: targetStage,
      status: 'RUNNING' as WorkflowStatus,
      error: undefined,
      pipelineRunId: newRunId,
    };

    // Clear humanEdits when going back to human_review or before,
    // so the draft shows the original content (not a previously accepted version).
    if (targetIdx <= humanReviewIdx) {
      resetPatch.humanEdits = '';
    }

    // Reset fields produced by stages after target
    for (const field of fieldsToReset) {
      if (field === 'inputFiles') {
        // Reset parse status for files back to pending
        resetPatch.inputFiles = state.inputFiles.map((f: UploadedFile): UploadedFile => ({
          ...f,
          parseStatus: 'pending',
          parseError: undefined,
          parseSummary: undefined,
          extractedText: undefined,
        }));
      } else {
        resetPatch[field] = [];
      }
    }

    const updatedState = { ...state, ...resetPatch } as DocGenState;
    this.states.set(projectId, updatedState);
    this.persistState(updatedState);
    this.emitProgress(updatedState, `↩ 回退到阶段: ${targetStage}`);

    // Re-run pipeline from target stage
    this.runPipeline(updatedState, targetStage).catch((err) => {
      log.error('Workflow error after goBack:', err);
      const s = this.states.get(projectId);
      if (s) {
        const errState = { ...s, status: 'FAILED' as WorkflowStatus, error: String(err) };
        this.states.set(projectId, errState);
        this.persistState(errState);
        this.emitProgress(errState, 'Workflow failed: ' + String(err));
      }
    });
  }

  private async runPipeline(state: DocGenState, startStage?: StageName): Promise<void> {
    const runId = state.pipelineRunId ?? 0;
    log.info('[WF][Engine] Pipeline started', { projectId: state.projectId, startStage: startStage ?? 'upload_parse', runId });

    // Helper: returns true if this pipeline run is still the active one.
    // If another pipeline was started (e.g. via goBack), this run's results are stale.
    const isActiveRun = (): boolean => {
      const current = this.states.get(state.projectId);
      return (current?.pipelineRunId ?? 0) === runId;
    };

    const config = {
      provider: this.provider,
      ragService: this.ragService,
      onProgress: (stage: StageName, message: string, data?: unknown) => {
        if (!isActiveRun()) return;
        const s = this.states.get(state.projectId);
        if (s) this.emitProgress({ ...s, currentStage: stage }, message, data);
      },
      onStream: (stage: StageName, chunk: string) => {
        if (!isActiveRun()) return;
        this.emitStream(state.projectId, stage, chunk);
      },
    };

    const stageRunners: Partial<Record<StageName, (s: DocGenState) => Promise<Partial<DocGenState>>>> = {
      upload_parse: (s) => runUploadParseStage(s, config),
      ingest: (s) => runIngestStage(s, config),
      analyze: (s) => runAnalyzeStage(s, config),
      draft: (s) => runDraftStage(s, config),
      ai_review: (s) => runAiReviewStage(s, config),
      post_edit_review: (s) => runPostEditReviewStage(s, config),
      localize: (s) => runLocalizeStage(s, config),
      localize_ai_review: (s) => runLocalizeAiReviewStage(s, config),
      dita_build: (s) => runDitaBuildStage(s, config),
      dita_ai_review: (s) => runDitaAiReviewStage(s, config),
      export: (s) => runExportStage(s, config),
    };

    let current: StageName = startStage ?? 'upload_parse';

    while (current) {
      // Abort entire loop if this pipeline run has been superseded
      if (!isActiveRun()) {
        log.info('[WF][Engine] Pipeline aborted (stale run)', { projectId: state.projectId, runId, stage: current });
        return;
      }

      let s = this.states.get(state.projectId)!;
      s = { ...s, currentStage: current, status: 'RUNNING' };
      this.states.set(state.projectId, s);
      this.persistState(s);
      log.info('[WF][Engine] Enter stage', {
        projectId: state.projectId,
        stage: current,
        status: s.status,
        runId,
      });

      if (PAUSE_STAGES.has(current)) {
        // Interrupt: pause and wait for human input
        const pauseStatus = getStatusForStage(current);
        s = { ...s, status: pauseStatus };
        this.states.set(state.projectId, s);
        this.persistState(s);
        this.emitProgress(s, `Waiting for human input at stage: ${current}`);
        log.info('[WF][Engine] Stage paused for human input', {
          projectId: state.projectId,
          stage: current,
          status: pauseStatus,
        });

        // Wait for resume signal
        await new Promise<void>((resolve) => {
          this.pendingResume.set(state.projectId, (data: unknown) => {
            // Discard if another pipeline run was started while we waited
            if (!isActiveRun()) {
              log.info('[WF][Engine] Pause resume discarded (stale run)', {
                projectId: state.projectId, runId, stage: current,
              });
              resolve();
              return;
            }
            log.info('[WF][Engine] Resume signal received', {
              projectId: state.projectId,
              stage: current,
              hasData: !!data,
            });
            // Apply human edits to state before continuing
            if (data && typeof data === 'object') {
              const updated = this.states.get(state.projectId)!;
              this.states.set(state.projectId, { ...updated, ...(data as Partial<DocGenState>) });
            }
            resolve();
          });
        });
      } else {
        const runner = stageRunners[current];
        if (runner) {
          log.info('[WF][Engine] Running stage runner', { projectId: state.projectId, stage: current });
          // If humanEdits is present, pass effective drafts to the stage.
          // We do NOT persist this change to the stored state so that
          // going-back to human_review still shows the original draft.
          const effectiveS = s.humanEdits
            ? { ...s, drafts: s.drafts.map((d) => ({ ...d, content: s.humanEdits, updatedAt: new Date().toISOString() })) }
            : s;
          const updates = await runner(effectiveS);

          // Discard results if another pipeline run was started while we waited
          if (!isActiveRun()) {
            log.info('[WF][Engine] Stage runner result discarded (stale run)', {
              projectId: state.projectId, runId, stage: current,
            });
            return;
          }

          const updated = { ...this.states.get(state.projectId)!, ...updates };
          this.states.set(state.projectId, updated);
          this.persistState(updated);
          this.emitProgress(updated, `Completed stage: ${current}`);
          log.info('[WF][Engine] Stage runner completed', {
            projectId: state.projectId,
            stage: current,
            nextStatus: updated.status,
          });
        } else {
          log.warn('[WF][Engine] No stage runner found; skipping stage', { projectId: state.projectId, stage: current });
        }
      }

      const next = nextStage(current);
      if (!next) break;

      // Stage 6b skip-localization: when the user chose to skip localization,
      // jump straight from human_confirm to dita_build, bypassing the four
      // localize stages (localize / review_localize / localize_ai_review /
      // human_localize_review). dita_build already falls back to the original
      // English drafts when localizedDrafts is empty.
      if (current === 'human_confirm') {
        const sAfter = this.states.get(state.projectId);
        if (sAfter?.skipLocalization && next === 'localize') {
          log.info('[WF][Engine] Skipping localization stages (user opted out)', {
            projectId: state.projectId, runId, from: current, to: 'dita_build',
          });
          current = 'dita_build';
          log.info('[WF][Engine] Stage transition', { projectId: state.projectId, from: current, to: 'dita_build' });
          continue;
        }
      }

      log.info('[WF][Engine] Stage transition', { projectId: state.projectId, from: current, to: next });
      current = next;
    }

    const finalState = this.states.get(state.projectId);
    log.info('[WF][Engine] Pipeline finished', {
      projectId: state.projectId,
      finalStage: finalState?.currentStage,
      finalStatus: finalState?.status,
    });
  }

  resumeFromHumanInput(projectId: string, data: unknown): void {
    log.info('[WF][Engine] resumeFromHumanInput called', {
      projectId,
      hasPendingResume: this.pendingResume.has(projectId),
      hasData: !!data,
    });
    const resolve = this.pendingResume.get(projectId);
    if (resolve) {
      this.pendingResume.delete(projectId);
      resolve(data);
      return;
    }
    log.warn('[WF][Engine] resumeFromHumanInput ignored: no pending waiter', { projectId });
  }

  getState(projectId: string): DocGenState | null {
    return this.states.get(projectId) ?? this.loadState(projectId);
  }

  private persistState(state: DocGenState): void {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO projects (id, name, status, current_stage, state_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM projects WHERE id = ?), ?), ?)
      `).run(
        state.projectId,
        `Project ${state.projectId.slice(0, 8)}`,
        state.status,
        state.currentStage,
        JSON.stringify(state),
        state.projectId,
        now,
        now
      );
    } catch (err) {
      log.error('Failed to persist state:', err);
    }
  }

  /**
   * AI-assisted draft editing (Stage 3a review_draft).
   * Sends the current draft + a user instruction to the AI, which returns
   * the edited Markdown. Streams chunks to the renderer via emitStream so
   * the user sees live progress. Does NOT mutate workflow state — the
   * caller decides whether to keep the result.
   */
  async aiEditDraft(projectId: string, currentContent: string, instruction: string): Promise<string> {
    log.info('[WF][Engine] aiEditDraft requested', { projectId, instructionLen: instruction.length, contentLen: currentContent.length });
    const systemPrompt = `You are an expert technical writer and editor.
You will be given the current draft of a technical document (in Markdown) and an editing instruction from the user.
Apply the instruction precisely to the relevant section(s) or content, preserving the overall structure, headings, and Markdown formatting.
Return ONLY the full edited Markdown document — no explanations, no preamble, no code fences.
Keep all unchanged sections intact. Maintain the same language (English) unless the instruction asks otherwise.`;
    const userPrompt = `Editing instruction:\n${instruction}\n\n---\n\nCurrent draft (Markdown):\n${currentContent}\n\n---\n\nApply the instruction and return the complete edited Markdown document.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    let full = '';
    for await (const chunk of this.provider.stream(messages)) {
      full += chunk;
      this.emitStream(projectId, 'review_draft', chunk);
    }
    log.info('[WF][Engine] aiEditDraft completed', { projectId, resultLen: full.length });
    return full;
  }

  private loadState(projectId: string): DocGenState | null {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT state_json FROM projects WHERE id = ?').get(projectId) as
        | { state_json: string }
        | undefined;
      if (!row) return null;
      const state = JSON.parse(row.state_json) as DocGenState;
      // Backfill fields added after initial release so old persisted states
      // don't break the pipeline (skipLocalization defaults to false).
      if (typeof state.skipLocalization !== 'boolean') state.skipLocalization = false;
      this.states.set(projectId, state);
      return state;
    } catch {
      return null;
    }
  }

  private emitProgress(state: DocGenState, message: string, data?: unknown): void {
    const logEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      stage: state.currentStage,
      level: 'info' as const,
      message,
      detail: data ? JSON.stringify(data).slice(0, 500) : undefined,
    };

    log.info('[WF][Progress]', {
      projectId: state.projectId,
      stage: state.currentStage,
      status: state.status,
      message,
    });

    // Append log entry to state
    const s = this.states.get(state.projectId);
    if (s) {
      this.states.set(state.projectId, {
        ...s,
        workflowLogs: [...s.workflowLogs, logEntry],
      });
    }

    if (this.window?.webContents && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.WORKFLOW_PROGRESS, {
        projectId: state.projectId,
        stage: state.currentStage,
        status: state.status,
        message,
        data,
        logEntries: [logEntry],
      });
    }
  }

  private emitStream(projectId: string, stage: StageName, chunk: string): void {
    if (this.window?.webContents && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.WORKFLOW_STREAM, {
        projectId,
        stage,
        chunk,
      });
    }
  }
}
