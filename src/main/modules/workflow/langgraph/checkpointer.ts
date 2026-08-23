import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';

let saver: SqliteSaver | null = null;

/**
 * Lazy singleton SqliteSaver backed by `userData/langgraph.db`.
 *
 * Each workflow project maps to a LangGraph thread (`thread_id = projectId`),
 * so checkpoints survive app restarts and enable both resume-after-crash and
 * checkpoint-replay go-back.
 */
export function getCheckpointer(): SqliteSaver {
  if (saver) return saver;
  const dbPath = path.join(app.getPath('userData'), 'langgraph.db');
  log.info('[WF][LangGraph] Opening checkpointer at', dbPath);
  saver = SqliteSaver.fromConnString(dbPath);
  return saver;
}