import type { WorkflowStatus, StageName } from '../../../shared/types/workflow.types';

export { WorkflowStatus, StageName };

export interface StageTransition {
  from: StageName;
  to: StageName;
  condition?: (status: WorkflowStatus) => boolean;
}

export const STAGE_ORDER: StageName[] = [
  'upload_parse',
  'review_upload',
  'ingest',
  'analyze',
  'review_analyze',
  'draft',
  'review_draft',
  'ai_review',
  'human_review',
  'dita_build',
  'review_dita',
  'dita_ai_review',
  'human_dita_review',
  'export',
];

export const PAUSE_STAGES = new Set<StageName>([
  'review_upload',
  'review_analyze',
  'review_draft',
  'human_review',
  'review_dita',
  'human_dita_review',
]);

export function getStatusForStage(stage: StageName): WorkflowStatus {
  switch (stage) {
    case 'review_upload': return 'PAUSED:REVIEW_UPLOAD';
    case 'review_analyze': return 'PAUSED:REVIEW_ANALYZE';
    case 'review_draft': return 'PAUSED:REVIEW_DRAFT';
    case 'human_review': return 'PAUSED:HUMAN_REVIEW';
    case 'review_dita': return 'PAUSED:REVIEW_DITA';
    case 'human_dita_review': return 'PAUSED:HUMAN_DITA_REVIEW';
    default: return 'RUNNING';
  }
}

export function nextStage(current: StageName): StageName | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}
