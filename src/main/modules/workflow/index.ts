import { BrowserWindow } from 'electron';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { Command } from '@langchain/langgraph';
import type { DocGenState, StageName, WorkflowStatus, WorkflowLogEntry } from '../../../shared/types/workflow.types';
import type { AIProvider } from '../ai-providers/base.provider';
import type { DocumentSearchService } from '../rag/local-search.service';
import { getDatabase } from '../storage/database';
import { getStatusForStage, PAUSE_STAGES, STAGE_ORDER } from './state-machine';
import { buildWorkflowGraph } from './langgraph/graph';
import { getCheckpointer } from './langgraph/checkpointer';
import { WorkflowEmitterImpl } from './langgraph/emitter';
import type { WorkflowGraphState } from './langgraph/graph-state';

/**
 * WorkflowEngine — LangGraph-backed facade.
 *
 * The public API (startWorkflow / resumeFromHumanInput / goBackToStage /
 * getState / aiEditDraft / updateProvider) is unchanged from the legacy
 * sequential engine, so the IPC layer and renderer are untouched.
 *
 * Execution is delegated to a compiled LangGraph StateGraph (20 stages /
 * 9 interrupt pause points). State persists in a SqliteSaver checkpointer
 * (thread_id = projectId); go-back uses checkpoint replay (time travel).
 *
 * A synchronous state cache + a state_json mirror in the projects table keep
 * getState() synchronous (the IPC handlers call it without await) and let
 * states survive app restarts.
 */
export class WorkflowEngine {
  private provider: AIProvider;
  private ragService: DocumentSearchService;
  private graph: ReturnType<typeof buildWorkflowGraph>;
  /** Synchronous state cache backing getState() (kept fresh by emitter + hydrate). */
  private stateCache = new Map<string, DocGenState>();
  /** Accumulated workflow logs per project. */
  private logs = new Map<string, WorkflowLogEntry[]>();
  /** Projects with an in-flight graph invoke. */
  private running = new Set<string>();
  /** AbortControllers for in-flight invokes (used by go-back / pause during RUNNING). */
  private abortControllers = new Map<string, AbortController>();

  constructor(provider: AIProvider, ragService: DocumentSearchService) {
    this.provider = provider;
    this.ragService = ragService;
    this.graph = buildWorkflowGraph();
  }

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
      humanEditedDrafts: [],
      postEditReviewComments: [],
      localizedDrafts: [],
      localizeReviewComments: [],
      ditaDocuments: [],
      ditaReviewComments: [],
      outputDocuments: [],
      ingestContext: '',
      targetLanguage: 'zh-CN',
      skipLocalization: false,
      workflowLogs: [],
      currentStage: 'upload_parse',
      status: 'RUNNING',
      pipelineRunId: 0,
    };
    this.stateCache.set(projectId, state);
    this.logs.set(projectId, []);
    this.persistMirror(state);
    log.info('[WF][Engine] Initial state persisted', {
      projectId,
      stage: state.currentStage,
      status: state.status,
      inputFileCount: state.inputFiles.length,
    });

    // Run the graph asynchronously (fire-and-forget).
    void this.runInvoke(projectId, state, { start: true });

    return state;
  }

  /**
   * Resume a paused graph with human input. Fire-and-forget — matches the
   * legacy engine's synchronous resolve semantics (IPC handlers don't await).
   */
  resumeFromHumanInput(projectId: string, data: unknown): void {
    log.info('[WF][Engine] resumeFromHumanInput called', { projectId, hasData: !!data });
    void this.doResume(projectId, data);
  }

  private async doResume(projectId: string, data: unknown): Promise<void> {
    if (this.running.has(projectId)) {
      log.warn('[WF][Engine] resumeFromHumanInput ignored: invoke in flight', { projectId });
      return;
    }
    const gs = await this.graph.getState({ configurable: { thread_id: projectId } });
    if (!gs?.next?.length) {
      log.warn('[WF][Engine] resumeFromHumanInput ignored: graph not paused', { projectId });
      return;
    }
    await this.runInvoke(projectId, data, { resume: data });
  }

  /**
   * Go back to a previous stage via checkpoint replay (time travel).
   * Aborts any in-flight invoke first so a stale run can't clobber the replay.
   */
  async goBackToStage(projectId: string, targetStage: StageName): Promise<void> {
    log.info('[WF][Engine] goBackToStage requested', { projectId, targetStage });
    const state = this.getState(projectId);
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

    // Abort any in-flight invoke (go-back during RUNNING) and wait for settle.
    const ac = this.abortControllers.get(projectId);
    if (ac) {
      log.info('[WF][Engine] goBackToStage aborting in-flight invoke', { projectId });
      ac.abort();
      let waited = 0;
      while (this.running.has(projectId) && waited < 10000) {
        await new Promise((r) => setTimeout(r, 25));
        waited += 25;
      }
    }

    // Find the checkpoint whose pending node is the target stage.
    const threadConfig = { configurable: { thread_id: projectId } };
    const history: Array<{ checkpoint_id?: string; next?: string[] }> = [];
    for await (const c of this.graph.getStateHistory(threadConfig)) {
      history.push({ checkpoint_id: c.config?.configurable?.checkpoint_id, next: c.next as string[] | undefined });
    }
    const target = history.find((c) => c.next?.includes(targetStage));
    if (!target?.checkpoint_id) {
      log.warn('[WF][Engine] goBackToStage: no checkpoint found for target', { projectId, targetStage });
      return;
    }
    log.info('[WF][Engine] goBackToStage replaying', { projectId, targetStage, checkpointId: target.checkpoint_id });

    const emitter = this.makeEmitter(projectId);
    emitter.setStatus('RUNNING');
    emitter.emitProgress(targetStage, `↩ 回退到阶段: ${targetStage}`);
    const config = {
      configurable: {
        thread_id: projectId,
        checkpoint_id: target.checkpoint_id,
        provider: this.provider,
        ragService: this.ragService,
        emitter,
      },
    };
    this.running.add(projectId);
    try {
      await this.graph.invoke(null, config);
      await this.hydrate(projectId);
    } catch (err) {
      log.error('[WF][Engine] goBackToStage replay failed:', err);
      const s = this.stateCache.get(projectId);
      if (s) {
        const errState = { ...s, status: 'FAILED' as WorkflowStatus, error: String(err) };
        this.stateCache.set(projectId, errState);
        this.persistMirror(errState);
      }
    } finally {
      this.running.delete(projectId);
    }
  }

  getState(projectId: string): DocGenState | null {
    return this.stateCache.get(projectId) ?? this.loadMirror(projectId);
  }

  /**
   * User-initiated pause (M3): aborts any in-flight graph invoke so the
   * current LLM call is cancelled (via the AbortSignal threaded through the
   * provider) and marks the project as PAUSED:USER. The graph checkpoint is
   * left at the last completed node, so resumeWorkflow() can continue from it.
   */
  async pauseWorkflow(projectId: string): Promise<void> {
    const state = this.getState(projectId);
    if (!state) {
      log.warn('[WF][Engine] pauseWorkflow: project not found', { projectId });
      return;
    }
    if (state.status !== 'RUNNING') {
      log.info('[WF][Engine] pauseWorkflow ignored: not running', { projectId, status: state.status });
      return;
    }
    log.info('[WF][Engine] pauseWorkflow aborting in-flight invoke', { projectId });
    const ac = this.abortControllers.get(projectId);
    if (ac) ac.abort();
    let waited = 0;
    while (this.running.has(projectId) && waited < 10000) {
      await new Promise((r) => setTimeout(r, 25));
      waited += 25;
    }
    const s = this.stateCache.get(projectId) ?? state;
    const paused = { ...s, status: 'PAUSED:USER' as WorkflowStatus };
    this.stateCache.set(projectId, paused);
    this.persistMirror(paused);
    log.info('[WF][Engine] pauseWorkflow applied', { projectId, stage: paused.currentStage });
  }

  /**
   * Resume a user-paused workflow (M3): continues the graph from the last
   * checkpoint, re-running the node that was interrupted by the pause.
   */
  async resumeWorkflow(projectId: string): Promise<void> {
    const state = this.getState(projectId);
    if (!state || state.status !== 'PAUSED:USER') {
      log.info('[WF][Engine] resumeWorkflow ignored: not user-paused', { projectId, status: state?.status });
      return;
    }
    log.info('[WF][Engine] resumeWorkflow continuing from checkpoint', { projectId });
    await this.runInvoke(projectId, null, { continue: true });
  }

  /**
   * Delete a project: clears in-memory state and removes the LangGraph
   * checkpoint thread so its checkpoints don't accumulate in langgraph.db.
   */
  async deleteProject(projectId: string): Promise<void> {
    log.info('[WF][Engine] deleteProject requested', { projectId });
    const ac = this.abortControllers.get(projectId);
    if (ac) ac.abort();
    this.running.delete(projectId);
    this.abortControllers.delete(projectId);
    this.stateCache.delete(projectId);
    this.logs.delete(projectId);
    try {
      await getCheckpointer().deleteThread(projectId);
      log.info('[WF][Engine] deleteProject: checkpoint thread removed', { projectId });
    } catch (err) {
      log.error('[WF][Engine] deleteProject: deleteThread failed', { projectId, error: String(err) });
    }
  }

  /**
   * AI-assisted draft editing (Stage 3a review_draft). Unchanged from the
   * legacy engine — streams via the provider directly.
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

  // --- internals ---

  private makeEmitter(projectId: string): WorkflowEmitterImpl {
    return new WorkflowEmitterImpl(projectId, (entry, status) => {
      const logs = this.logs.get(projectId) ?? [];
      logs.push(entry);
      this.logs.set(projectId, logs);
      // Keep the sync cache fresh during running invokes so getState() returns
      // the current stage/status (the renderer fetches full state on stage change).
      const cached = this.stateCache.get(projectId);
      if (cached) {
        this.stateCache.set(projectId, { ...cached, currentStage: entry.stage, status });
      }
    });
  }

  private async runInvoke(projectId: string, input: unknown, opts: { start?: boolean; resume?: unknown; continue?: boolean }): Promise<void> {
    if (this.running.has(projectId)) {
      log.warn('[WF][Engine] runInvoke skipped: already running', { projectId });
      return;
    }
    this.running.add(projectId);
    const ac = new AbortController();
    this.abortControllers.set(projectId, ac);
    const emitter = this.makeEmitter(projectId);
    const config = {
      configurable: {
        thread_id: projectId,
        provider: this.provider,
        ragService: this.ragService,
        emitter,
      },
      signal: ac.signal,
    };
    try {
      if (opts.start) {
        // Strip facade-owned fields not in the graph state schema.
        const graphInput = { ...(input as DocGenState) };
        delete (graphInput as Record<string, unknown>).workflowLogs;
        delete (graphInput as Record<string, unknown>).error;
        delete (graphInput as Record<string, unknown>).pipelineRunId;
        await this.graph.invoke(graphInput, config);
      } else if (opts.continue) {
        // Continue from the last checkpoint (used after a user pause).
        await this.graph.invoke(null, config);
      } else {
        await this.graph.invoke(new Command({ resume: opts.resume }), config);
      }
      await this.hydrate(projectId);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        log.info('[WF][Engine] Invoke aborted', { projectId });
        emitter.setActive(false);
      } else {
        log.error('[WF][Engine] Workflow error:', err);
        const s = this.stateCache.get(projectId);
        if (s) {
          const errState = { ...s, status: 'FAILED' as WorkflowStatus, error: String(err) };
          this.stateCache.set(projectId, errState);
          this.persistMirror(errState);
          emitter.setStatus('FAILED');
          emitter.emitProgress(s.currentStage, 'Workflow failed: ' + String(err));
        }
      }
    } finally {
      this.running.delete(projectId);
      this.abortControllers.delete(projectId);
    }
  }

  /** Read the latest graph checkpoint into the sync cache + mirror. */
  private async hydrate(projectId: string): Promise<void> {
    const threadConfig = { configurable: { thread_id: projectId } };
    const gs = await this.graph.getState(threadConfig);
    if (!gs?.values || Object.keys(gs.values).length === 0) return;
    const values = gs.values as WorkflowGraphState;
    let status = values.status;
    let currentStage = values.currentStage;
    // When interrupted at a pause node, surface the pause stage + PAUSED status
    // (the checkpoint itself holds the pre-pause stage with status RUNNING).
    if (gs.next?.length === 1 && PAUSE_STAGES.has(gs.next[0] as StageName)) {
      status = getStatusForStage(gs.next[0] as StageName);
      currentStage = gs.next[0] as StageName;
    }
    const state: DocGenState = {
      ...values,
      workflowLogs: this.logs.get(projectId) ?? [],
      status,
      currentStage,
      error: undefined,
      pipelineRunId: 0,
    };
    this.stateCache.set(projectId, state);
    this.persistMirror(state);
    log.info('[WF][Engine] State hydrated', { projectId, stage: currentStage, status });
  }

  /** Write a sync-readable mirror of the state to the projects table. */
  private persistMirror(state: DocGenState): void {
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

  /** Load a previously persisted mirror (used by getState after restart). */
  private loadMirror(projectId: string): DocGenState | null {
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
      if (!Array.isArray(state.humanEditedDrafts)) state.humanEditedDrafts = [];
      if (typeof state.ingestContext !== 'string') state.ingestContext = '';
      this.stateCache.set(projectId, state);
      return state;
    } catch {
      return null;
    }
  }

  private emitStream(projectId: string, stage: StageName, chunk: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send('workflow:stream', {
          projectId,
          stage,
          chunk,
        });
      }
    }
  }
}