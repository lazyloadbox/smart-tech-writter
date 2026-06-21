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
  'post_edit_review',
  'human_confirm',
  'localize',
  'review_localize',
  'localize_ai_review',
  'human_localize_review',
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
  'human_confirm',
  'review_localize',
  'human_localize_review',
  'review_dita',
  'human_dita_review',
]);

export function getStatusForStage(stage: StageName): WorkflowStatus {
  switch (stage) {
    case 'review_upload': return 'PAUSED:REVIEW_UPLOAD';
    case 'review_analyze': return 'PAUSED:REVIEW_ANALYZE';
    case 'review_draft': return 'PAUSED:REVIEW_DRAFT';
    case 'human_review': return 'PAUSED:HUMAN_REVIEW';
    case 'human_confirm': return 'PAUSED:HUMAN_CONFIRM';
    case 'review_localize': return 'PAUSED:REVIEW_LOCALIZE';
    case 'human_localize_review': return 'PAUSED:HUMAN_LOCALIZE_REVIEW';
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

/** Returns the stage immediately before the given stage, or null if at the first stage */
export function previousStage(current: StageName): StageName | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return STAGE_ORDER[idx - 1];
}

/**
 * Returns the set of state fields that should be cleared when going back
 * to a target stage. Fields produced by stages AFTER the target are reset.
 */
export function getFieldsToResetAfterStage(targetStage: StageName): (keyof import('../../../shared/types/workflow.types').DocGenState)[] {
  const targetIdx = STAGE_ORDER.indexOf(targetStage);
  if (targetIdx === -1) return [];

  const fieldsProducedByStage: Partial<Record<StageName, (keyof import('../../../shared/types/workflow.types').DocGenState)[]>> = {
    upload_parse: ['inputFiles'],
    analyze: ['analysisResults', 'referenceSearchResults'],
    draft: ['drafts'],
    ai_review: ['aiReviewComments'],
    post_edit_review: ['postEditReviewComments'],
    localize: ['localizedDrafts'],
    localize_ai_review: ['localizeReviewComments'],
    dita_build: ['ditaDocuments'],
    dita_ai_review: ['ditaReviewComments'],
    export: ['outputDocuments'],
  };

  const fieldsToReset: (keyof import('../../../shared/types/workflow.types').DocGenState)[] = [];
  for (let i = targetIdx + 1; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    const fields = fieldsProducedByStage[stage];
    if (fields) fieldsToReset.push(...fields);
  }
  return [...new Set(fieldsToReset)];
}
