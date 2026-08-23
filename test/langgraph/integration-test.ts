/**
 * Integration test — drives the REAL WorkflowEngine (LangGraph facade) with a
 * mock AI provider through the full 20-stage flow, go-back, crash recovery,
 * concurrency, and cleanup.
 *
 * Bundled to CJS via vite.test.config.ts (handles ESM @langchain/*), then run
 * inside Electron: `npx electron scratch/langgraph-spike/dist/integration-test.js`
 */
import { app } from 'electron';
import path from 'node:path';
import { WorkflowEngine } from '../../src/main/modules/workflow/index';
import { getDatabase } from '../../src/main/modules/storage/database';
import type { AIProvider, AIMessage, CompletionOptions } from '../../src/main/modules/ai-providers/base.provider';
import type { DocGenState, WorkflowStatus } from '../../src/shared/types/workflow.types';

class MockProvider implements AIProvider {
  providerName = 'mock';
  async complete(_messages: AIMessage[], _options?: CompletionOptions): Promise<string> {
    return 'MOCK RESPONSE';
  }
  async *stream(_messages: AIMessage[], _options?: CompletionOptions): AsyncIterable<string> {
    yield 'MOCK ';
    yield 'RESPONSE';
  }
  async embed(_text: string): Promise<number[]> {
    return [];
  }
}

class MockRag {
  async search(_query: string): Promise<never[]> {
    return [];
  }
}

/** Slow provider — keeps the invoke in-flight long enough to test pause (M3). */
class SlowProvider extends MockProvider {
  async complete(_messages: AIMessage[], _options?: CompletionOptions): Promise<string> {
    await sleep(3000);
    return 'SLOW RESPONSE';
  }
  async *stream(_messages: AIMessage[], _options?: CompletionOptions): AsyncIterable<string> {
    await sleep(3000);
    yield 'SLOW RESPONSE';
  }
}

const TEST_FILE = path.resolve(__dirname, '../../../test/mock-case-01/esp32-pwm-dita-input.txt');

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForStatus(
  engine: WorkflowEngine,
  projectId: string,
  status: WorkflowStatus,
  timeoutMs = 60000
): Promise<DocGenState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = engine.getState(projectId);
    if (s && s.status === status) return s;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${status}; last: ${JSON.stringify(engine.getState(projectId))}`);
}

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}`, detail ?? '');
  }
}

app.whenReady().then(async () => {
  try {
    const engine = new WorkflowEngine(new MockProvider(), new MockRag() as never);
    const projectId = `test-${Date.now()}`;

    console.log('\n=== 1. startWorkflow → 应停在 review_upload ===');
    const initial = await engine.startWorkflow(projectId, [TEST_FILE]);
    check('initial state RUNNING', initial.status === 'RUNNING');
    let s = await waitForStatus(engine, projectId, 'PAUSED:REVIEW_UPLOAD');
    check('paused at review_upload', s.currentStage === 'review_upload');
    check('inputFiles parsed', s.inputFiles.every((f) => f.parseStatus === 'done'));

    console.log('\n=== 2. resume review_upload → review_analyze ===');
    engine.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine, projectId, 'PAUSED:REVIEW_ANALYZE');
    check('paused at review_analyze', s.currentStage === 'review_analyze');
    check('analysisResults populated', s.analysisResults.length > 0);

    console.log('\n=== 3. resume review_analyze → review_draft ===');
    engine.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine, projectId, 'PAUSED:REVIEW_DRAFT');
    check('paused at review_draft', s.currentStage === 'review_draft');
    check('drafts populated', s.drafts.length > 0);

    console.log('\n=== 4. resume review_draft → human_review ===');
    engine.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine, projectId, 'PAUSED:HUMAN_REVIEW');
    check('paused at human_review', s.currentStage === 'human_review');
    check('aiReviewComments populated', s.aiReviewComments.length > 0);

    console.log('\n=== 5. resume human_review (humanEdits) → human_confirm ===');
    engine.resumeFromHumanInput(projectId, { humanEdits: 'EDITED CONTENT' });
    s = await waitForStatus(engine, projectId, 'PAUSED:HUMAN_CONFIRM');
    check('paused at human_confirm', s.currentStage === 'human_confirm');
    check('humanEdits stored', s.humanEdits === 'EDITED CONTENT');

    console.log('\n=== 6. resume human_confirm (skipLocalization) → review_dita ===');
    engine.resumeFromHumanInput(projectId, { skipLocalization: true, targetLanguage: 'zh-CN' });
    s = await waitForStatus(engine, projectId, 'PAUSED:REVIEW_DITA');
    check('paused at review_dita (localization skipped)', s.currentStage === 'review_dita');
    check('ditaDocuments populated', s.ditaDocuments.length > 0);
    check('localizedDrafts empty (skipped)', s.localizedDrafts.length === 0);

    console.log('\n=== 7. resume review_dita → human_dita_review ===');
    engine.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine, projectId, 'PAUSED:HUMAN_DITA_REVIEW');
    check('paused at human_dita_review', s.currentStage === 'human_dita_review');
    check('ditaReviewComments populated', s.ditaReviewComments.length > 0);

    console.log('\n=== 8. resume human_dita_review → COMPLETED ===');
    engine.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine, projectId, 'COMPLETED');
    check('completed', s.status === 'COMPLETED');
    check('outputDocuments populated', s.outputDocuments.length > 0);

    console.log('\n=== 9. goBack to review_draft ===');
    await engine.goBackToStage(projectId, 'review_draft');
    s = await waitForStatus(engine, projectId, 'PAUSED:REVIEW_DRAFT');
    check('back at review_draft', s.currentStage === 'review_draft');
    check('drafts preserved (from draft stage)', s.drafts.length > 0);
    check('aiReviewComments reset', s.aiReviewComments.length === 0);
    check('ditaDocuments reset', s.ditaDocuments.length === 0);
    check('humanEdits reset (target before human_review)', s.humanEdits === '');

    console.log('\n=== 10. 崩溃恢复：新引擎实例读同一检查点 ===');
    const engine2 = new WorkflowEngine(new MockProvider(), new MockRag() as never);
    const restored = engine2.getState(projectId);
    check('restored state exists', !!restored);
    check('restored paused at review_draft', restored?.currentStage === 'review_draft' && restored?.status === 'PAUSED:REVIEW_DRAFT');

    console.log('\n=== 11. 从恢复点继续走完 ===');
    engine2.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine2, projectId, 'PAUSED:HUMAN_REVIEW');
    check('resumed to human_review', s.currentStage === 'human_review');
    engine2.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine2, projectId, 'PAUSED:HUMAN_CONFIRM');
    engine2.resumeFromHumanInput(projectId, { skipLocalization: true });
    s = await waitForStatus(engine2, projectId, 'PAUSED:REVIEW_DITA');
    engine2.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine2, projectId, 'PAUSED:HUMAN_DITA_REVIEW');
    engine2.resumeFromHumanInput(projectId, {});
    s = await waitForStatus(engine2, projectId, 'COMPLETED');
    check('completed after restore', s.status === 'COMPLETED');

    console.log('\n=== 12. 并发：第二个项目独立运行 ===');
    const projectId2 = `test-${Date.now()}-2`;
    await engine.startWorkflow(projectId2, [TEST_FILE]);
    const s2 = await waitForStatus(engine, projectId2, 'PAUSED:REVIEW_UPLOAD');
    check('project2 paused at review_upload', s2.currentStage === 'review_upload');
    // project1 was completed via engine2 (the restore instance) — check its cache.
    const s1 = engine2.getState(projectId);
    check('project1 still COMPLETED', s1?.status === 'COMPLETED');

    console.log('\n=== 13. 用户暂停/继续 (M3) ===');
    const engine3 = new WorkflowEngine(new SlowProvider(), new MockRag() as never);
    const projectId3 = `test-${Date.now()}-pause`;
    await engine3.startWorkflow(projectId3, [TEST_FILE]);
    // Give the slow invoke a moment to get in-flight, then pause it.
    await sleep(150);
    await engine3.pauseWorkflow(projectId3);
    s = await waitForStatus(engine3, projectId3, 'PAUSED:USER', 15000);
    check('paused by user', s.status === 'PAUSED:USER');
    check('pause on non-running is no-op', (await engine3.pauseWorkflow(projectId3)) === undefined);
    await engine3.resumeWorkflow(projectId3);
    s = await waitForStatus(engine3, projectId3, 'PAUSED:REVIEW_UPLOAD', 20000);
    check('resumed to review_upload', s.currentStage === 'review_upload');
    check('inputFiles parsed after resume', s.inputFiles.every((f) => f.parseStatus === 'done'));
    await engine3.deleteProject(projectId3);

    console.log('\n=== 14. deleteProject 清理 ===');
    const db = getDatabase();
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId2);
    await engine.deleteProject(projectId);
    await engine.deleteProject(projectId2);
    check('project1 state cleared', engine.getState(projectId) === null);
    check('project2 state cleared', engine.getState(projectId2) === null);

    console.log(failures === 0 ? '\n=== ALL INTEGRATION TESTS PASSED ===' : `\n=== ${failures} FAILURES ===`);
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (err) {
    console.error('INTEGRATION TEST ERROR:', err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});