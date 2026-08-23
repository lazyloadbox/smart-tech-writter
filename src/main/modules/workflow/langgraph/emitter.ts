import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../../../shared/types/ipc.types';
import type { StageName, WorkflowLogEntry, WorkflowStatus } from '../../../../shared/types/workflow.types';
import type { AIStreamChunk } from '../../ai-providers/base.provider';

/**
 * Emits progress/stream events to the renderer and accumulates workflow logs.
 * Injected into LangGraph nodes via `config.configurable.emitter`.
 */
export interface WorkflowEmitter {
  emitProgress(stage: StageName, message: string, data?: unknown): void;
  emitStream(stage: StageName, chunk: AIStreamChunk): void;
  setStatus(status: WorkflowStatus): void;
  /** Disable further emissions (used when an invoke is aborted by go-back). */
  setActive(active: boolean): void;
}

export class WorkflowEmitterImpl implements WorkflowEmitter {
  private status: WorkflowStatus = 'RUNNING';
  private active = true;

  constructor(
    private projectId: string,
    /**
     * Called for every progress event with the log entry and the current
     * status. The WorkflowEngine facade uses this to accumulate logs AND to
     * keep its synchronous state cache fresh during running invokes.
     */
    private onEvent: (entry: WorkflowLogEntry, status: WorkflowStatus) => void
  ) {}

  setStatus(status: WorkflowStatus): void {
    this.status = status;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  /** Broadcast an IPC payload to every open window (multi-window safe). */
  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }

  emitProgress(stage: StageName, message: string, data?: unknown): void {
    if (!this.active) return;
    const logEntry: WorkflowLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      stage,
      level: 'info',
      message,
      detail: data ? JSON.stringify(data).slice(0, 500) : undefined,
    };
    this.onEvent(logEntry, this.status);
    log.info('[WF][Progress]', {
      projectId: this.projectId,
      stage,
      status: this.status,
      message,
    });
    this.broadcast(IPC_CHANNELS.WORKFLOW_PROGRESS, {
      projectId: this.projectId,
      stage,
      status: this.status,
      message,
      data,
      logEntries: [logEntry],
    });
  }

  emitStream(stage: StageName, chunk: AIStreamChunk): void {
    if (!this.active) return;
    this.broadcast(IPC_CHANNELS.WORKFLOW_STREAM, {
      projectId: this.projectId,
      stage,
      chunk,
    });
  }
}