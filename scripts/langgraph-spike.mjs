// Phase 0 spike: verify LangGraph 1.4.4 APIs needed for the workflow rebuild.
// Run: node scripts/langgraph-spike.mjs
import { Annotation, StateGraph, interrupt, Command, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { rm } from 'node:fs/promises';

const DB = new URL('./spike-checkpoints.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const log = (...a) => console.log('[spike]', ...a);

// ---- 1. Annotation.Root state schema with default (overwrite) reducer ----
const State = Annotation.Root({
  count: Annotation,
  text: Annotation,
  logs: Annotation,
  status: Annotation,
  currentStage: Annotation,
});

// ---- 2. Graph: step1 -> pause_wait (interrupt) -> step2 -> END ----
const builder = new StateGraph(State)
  .addNode('step1', async (s) => {
    return { count: (s.count ?? 0) + 1, currentStage: 'step1', status: 'RUNNING' };
  })
  .addNode('pause_wait', async (s) => {
    // First execution: throws GraphInterrupt -> graph pauses.
    // After resume: returns the resume value.
    const data = interrupt({ stage: 'pause' });
    log('pause_wait resumed with:', JSON.stringify(data));
    return { ...(data ?? {}), currentStage: 'pause_wait', status: 'RUNNING' };
  })
  .addNode('step2', async (s) => {
    return { count: (s.count ?? 0) + 100, text: s.text, currentStage: 'step2', status: 'RUNNING' };
  })
  .addEdge(START, 'step1')
  .addEdge('step1', 'pause_wait')
  .addEdge('pause_wait', 'step2')
  .addEdge('step2', END);

async function sqliteSection() {
  let saver;
  try {
    saver = SqliteSaver.fromConnString(DB);
  } catch (e) {
    log('SKIP SQLITE SECTION (ABI/native load issue):', e?.message?.slice(0, 120));
    return null;
  }

  // v1.4.4: invoke/getState/updateState live on the COMPILED graph.
  const app = builder.compile({ checkpointer: saver });
  const cfg = { configurable: { thread_id: 't1' } };

  const r1 = await app.invoke({ count: 0, text: 'orig', status: 'IDLE', currentStage: 'start' }, cfg);
  log('invoke#1 returned (interrupted):', JSON.stringify(r1));

  const s1 = await app.getState(cfg);
  log('getState#1 values:', JSON.stringify(s1.values));
  log('getState#1 next:', JSON.stringify(s1.next));
  log('getState#1 checkpoint_id:', s1.config?.configurable?.checkpoint_id);
  log('getState#1 tasks:', JSON.stringify(s1.tasks?.map((t) => ({ name: t.name, interrupts: t.interrupts })) ?? null));

  // resume with Command
  const r2 = await app.invoke(new Command({ resume: { text: 'edited!' } }), cfg);
  log('invoke#2 resume final:', JSON.stringify(r2));

  // checkpoint listing
  const cps = [];
  for await (const cp of saver.list({ configurable: { thread_id: 't1' } })) {
    cps.push({
      id: cp.config?.configurable?.checkpoint_id,
      source: cp.metadata?.source,
      step: cp.metadata?.step,
      next: cp.metadata?.next ?? null,
    });
  }
  log('checkpoints:', JSON.stringify(cps, null, 1));

  // time-travel replay from an earlier checkpoint
  const cpStep1 = cps.find((c) => c.source === 'step1');
  const replayCfg = { configurable: { thread_id: 't1', checkpoint_id: cpStep1.id } };
  const r3 = await app.invoke(null, replayCfg);
  log('replay from step1 checkpoint (should interrupt again):', JSON.stringify(r3));
  const s3 = await app.getState({ configurable: { thread_id: 't1' } });
  log('getState#3 after replay values:', JSON.stringify(s3.values));

  // updateState
  try {
    const up = await app.updateState({ values: { status: 'FAILED', text: 'x' } }, { configurable: { thread_id: 't1' } });
    log('updateState result checkpoint_id:', up?.config?.configurable?.checkpoint_id);
    const s4 = await app.getState({ configurable: { thread_id: 't1' } });
    log('getState#4 after updateState values:', JSON.stringify(s4.values));
  } catch (e) {
    log('updateState FAILED:', e?.constructor?.name, e?.message?.slice(0, 200));
  }
  return cfg;
}

async function main() {
  await sqliteSection();

  // MemorySaver smoke (no native module)
  const memApp = builder.compile({ checkpointer: new MemorySaver() });
  const r5 = await memApp.invoke({ count: 0, text: 'm', status: 'IDLE', currentStage: 'start' }, { configurable: { thread_id: 't2' } });
  log('MemorySaver invoke interrupted ok:', JSON.stringify(r5));

  // node receives config as 2nd arg (provider injection path)
  const g2 = new StateGraph(Annotation.Root({ v: Annotation }))
    .addNode('n', async (_s, config) => {
      return { v: config?.configurable?.customValue ?? 'MISSING' };
    })
    .addEdge(START, 'n')
    .addEdge('n', END)
    .compile();
  const r6 = await g2.invoke({ v: '' }, { configurable: { customValue: 'from-config' } });
  log('configurable injection:', JSON.stringify(r6));

  await rm(DB, { force: true });
  log('ALL SPIKE CHECKS DONE');
  process.exit(0);
}

main().catch((e) => {
  console.error('[spike] FATAL:', e?.constructor?.name, e?.message);
  console.error(e?.stack);
  process.exit(1);
});
