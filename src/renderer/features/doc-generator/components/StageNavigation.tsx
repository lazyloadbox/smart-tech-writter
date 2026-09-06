import React from 'react';
import type { StageName, WorkflowStatus } from '../../../../shared/types/workflow.types';
import { en as ui } from '../../../../shared/i18n';
import { StepNavigation, type StepNavItem } from '../../../components/StepNavigation';

const STAGES: StepNavItem[] = [
  { id: 'upload_parse', label: `0. ${ui.workflow.stages.upload_parse}` },
  { id: 'review_upload', label: `0a. ${ui.workflow.stages.review_upload}`, isPause: true },
  { id: 'ingest', label: `1. ${ui.workflow.stages.ingest}` },
  { id: 'analyze', label: `2. ${ui.workflow.stages.analyze}` },
  { id: 'review_analyze', label: `2a. ${ui.workflow.stages.review_analyze}`, isPause: true },
  { id: 'draft', label: `3. ${ui.workflow.stages.draft}` },
  { id: 'review_draft', label: `3a. ${ui.workflow.stages.review_draft}`, isPause: true },
  { id: 'ai_review', label: `4. ${ui.workflow.stages.ai_review}` },
  { id: 'human_review', label: `5. ${ui.workflow.stages.human_review}`, isPause: true },
  { id: 'dita_build', label: `6. ${ui.workflow.stages.dita_build}` },
  { id: 'review_dita', label: `6a. ${ui.workflow.stages.review_dita}`, isPause: true },
  { id: 'dita_ai_review', label: `6b. ${ui.workflow.stages.dita_ai_review}` },
  { id: 'human_dita_review', label: `6c. ${ui.workflow.stages.human_dita_review}`, isPause: true },
  { id: 'export', label: `7. ${ui.workflow.stages.export}` },
];

interface StageNavigationProps {
  currentStage: StageName;
  status: WorkflowStatus;
  onNewProject: () => void;
  onGoBack?: (targetStage: StageName) => void;
}

/**
 * Doc-generator stage navigation — thin wrapper over the shared
 * `StepNavigation` sidebar (kept for a stable public API).
 */
export const StageNavigation: React.FC<StageNavigationProps> = ({
  currentStage,
  status,
  onNewProject,
  onGoBack,
}) => (
  <StepNavigation
    title={ui.common.workflowSteps}
    steps={STAGES}
    currentStep={currentStage}
    status={status}
    onGoBack={onGoBack ? (target) => onGoBack(target as StageName) : undefined}
    footer={
      <button
        onClick={onNewProject}
        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
      >
        + {ui.docGenerator.newProject}
      </button>
    }
  />
);
