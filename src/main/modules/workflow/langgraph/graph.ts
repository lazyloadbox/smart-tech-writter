import { StateGraph, START, END, interrupt } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AIProvider } from '../../ai-providers/base.provider';
import type { DocumentSearchService } from '../../rag/local-search.service';
import type { DocGenState, StageName } from '../../../../shared/types/workflow.types';
import { getStatusForStage } from '../state-machine';
import {
  runUploadParseStage,
  runIngestStage,
  runAnalyzeStage,
  runDraftStage,
  runAiReviewStage,
  runDitaBuildStage,
  runDitaAiReviewStage,
  runExportStage,
} from '../pipeline';
import type { PipelineConfig } from '../pipeline';
import type { WorkflowEmitter } from './emitter';
import type { PromptOverrides } from '../../prompts';
import { WorkflowStateAnnotation, type WorkflowGraphState } from './graph-state';
import { getCheckpointer } from './checkpointer';

/**
 * Per-invoke runtime injected via `config.configurable`.
 * The facade builds one per project and passes it on every invoke, so
 * provider hot-swap (updateProvider) takes effect on the next invoke.
 */
export interface NodeRuntime {
  provider: AIProvider;
  ragService: DocumentSearchService;
  emitter: WorkflowEmitter;
  /** 用户配置的提示词覆盖（每次 invoke 从 settings 表加载）。 */
  promptOverrides?: PromptOverrides;
}

/** Bridge graph state (no workflowLogs/error/pipelineRunId) to DocGenState. */
function toDocGenState(s: WorkflowGraphState): DocGenState {
  return {
    ...s,
    workflowLogs: [],
    error: undefined,
    pipelineRunId: 0,
  } as DocGenState;
}

/**
 * Wraps a pipeline stage runner as a LangGraph node.
 * - Sets status=RUNNING and emits progress via the injected emitter.
 * - Applies human edits to drafts for downstream stages WITHOUT persisting
 *   them (mirrors the old engine's `effectiveS` behavior). Multi-draft edits
 *   (`humanEditedDrafts`) take precedence; the legacy single-string
 *   `humanEdits` is applied to drafts[0] only (M1).
 * - Threads the invoke AbortSignal into the runner so pause/go-back can
 *   cancel in-flight LLM calls (M3/M4).
 * - Merges the runner's Partial<DocGenState> updates into the graph state.
 */
function makeExecutionNode(
  stage: StageName,
  runner: (s: DocGenState, cfg: PipelineConfig) => Promise<Partial<DocGenState>>
) {
  return async (state: WorkflowGraphState, config: RunnableConfig) => {
    const rt = config.configurable as NodeRuntime;
    rt.emitter.setStatus('RUNNING');
    let effectiveDrafts = state.drafts;
    if (state.humanEditedDrafts && state.humanEditedDrafts.length > 0) {
      effectiveDrafts = state.humanEditedDrafts;
    } else if (state.humanEdits) {
      effectiveDrafts = state.drafts.map((d, i) =>
        i === 0 ? { ...d, content: state.humanEdits, updatedAt: new Date().toISOString() } : d
      );
    }
    const effectiveS = { ...state, drafts: effectiveDrafts };
    const updates = await runner(toDocGenState(effectiveS), {
      provider: rt.provider,
      ragService: rt.ragService,
      signal: config.signal,
      onProgress: (s, m, d) => rt.emitter.emitProgress(s, m, d),
      onStream: (s, c) => rt.emitter.emitStream(s, c),
      promptOverrides: rt.promptOverrides,
    });
    return {
      ...updates,
      currentStage: stage,
      status: updates.status ?? 'RUNNING',
    } as Partial<WorkflowGraphState>;
  };
}

/**
 * Wraps a human-interrupt stage as a LangGraph node.
 * Calls `interrupt({ stage })` to pause; on resume the returned payload
 * (from `Command({ resume: data })`) is merged into the graph state.
 */
function makePauseNode(stage: StageName) {
  return async (_state: WorkflowGraphState, config: RunnableConfig) => {
    const rt = config.configurable as NodeRuntime;
    rt.emitter.setStatus(getStatusForStage(stage));
    rt.emitter.emitProgress(stage, `Waiting for human input at stage: ${stage}`);
    const data = interrupt({ stage });
    if (data && typeof data === 'object') {
      return data as Partial<WorkflowGraphState>;
    }
    return {};
  };
}

/**
 * Builds and compiles the workflow StateGraph (14 active stages / 7 pause points).
 * The graph is static across projects; per-project runtime (provider, RAG,
 * emitter) flows through `config.configurable`.
 */
export function buildWorkflowGraph() {
  const g = new StateGraph(WorkflowStateAnnotation)
    .addNode('upload_parse', makeExecutionNode('upload_parse', runUploadParseStage))
    .addNode('review_upload', makePauseNode('review_upload'))
    .addNode('ingest', makeExecutionNode('ingest', runIngestStage))
    .addNode('analyze', makeExecutionNode('analyze', runAnalyzeStage))
    .addNode('review_analyze', makePauseNode('review_analyze'))
    .addNode('draft', makeExecutionNode('draft', runDraftStage))
    .addNode('review_draft', makePauseNode('review_draft'))
    .addNode('ai_review', makeExecutionNode('ai_review', runAiReviewStage))
    .addNode('human_review', makePauseNode('human_review'))
    .addNode('dita_build', makeExecutionNode('dita_build', runDitaBuildStage))
    .addNode('review_dita', makePauseNode('review_dita'))
    .addNode('dita_ai_review', makeExecutionNode('dita_ai_review', runDitaAiReviewStage))
    .addNode('human_dita_review', makePauseNode('human_dita_review'))
    .addNode('export', makeExecutionNode('export', runExportStage))
    .addEdge(START, 'upload_parse')
    .addEdge('upload_parse', 'review_upload')
    .addEdge('review_upload', 'ingest')
    .addEdge('ingest', 'analyze')
    .addEdge('analyze', 'review_analyze')
    .addEdge('review_analyze', 'draft')
    .addEdge('draft', 'review_draft')
    .addEdge('review_draft', 'ai_review')
    .addEdge('ai_review', 'human_review')
    .addEdge('human_review', 'dita_build')
    .addEdge('dita_build', 'review_dita')
    .addEdge('review_dita', 'dita_ai_review')
    .addEdge('dita_ai_review', 'human_dita_review')
    .addEdge('human_dita_review', 'export')
    .addEdge('export', END);

  return g.compile({ checkpointer: getCheckpointer() });
}
