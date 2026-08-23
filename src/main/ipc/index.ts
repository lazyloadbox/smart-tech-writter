import type { WorkflowEngine } from '../modules/workflow/index';
import type { RagService } from '../modules/rag/semantic-search.service';
import { registerWorkflowHandlers } from './workflow.ipc';
import { registerFileHandlers } from './file.ipc';
import { registerRagHandlers } from './rag.ipc';
import { registerSettingsHandlers } from './settings.ipc';

export function registerAllIpcHandlers(
  engine: WorkflowEngine,
  ragService: RagService
): void {
  registerWorkflowHandlers(engine);
  registerFileHandlers(engine);
  registerRagHandlers(ragService);
  registerSettingsHandlers(engine);
}
