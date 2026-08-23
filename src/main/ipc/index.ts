import type { WorkflowEngine } from '../modules/workflow/index';
import type { RagService } from '../modules/rag/semantic-search.service';
import type { LocalizationService } from '../modules/localization/localization.service';
import type { MappingService } from '../modules/localization/mapping.service';
import { registerWorkflowHandlers } from './workflow.ipc';
import { registerFileHandlers } from './file.ipc';
import { registerRagHandlers } from './rag.ipc';
import { registerSettingsHandlers } from './settings.ipc';
import { registerLocalizationHandlers } from './localization.ipc';
import { registerMappingHandlers } from './mapping.ipc';

export function registerAllIpcHandlers(
  engine: WorkflowEngine,
  ragService: RagService,
  localizationService: LocalizationService,
  mappingService: MappingService
): void {
  registerWorkflowHandlers(engine);
  registerFileHandlers(engine);
  registerRagHandlers(ragService);
  registerSettingsHandlers(engine, localizationService);
  registerLocalizationHandlers(localizationService);
  registerMappingHandlers(mappingService);
}
