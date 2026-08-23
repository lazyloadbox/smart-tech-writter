import React from 'react';
import type { StageName, WorkflowStatus } from '../../../../shared/types/workflow.types';
import { StepNavigation, type StepNavItem } from '../../../components/StepNavigation';

const STAGES: StepNavItem[] = [
  { id: 'upload_parse', label: '0. 上传 & 解析' },
  { id: 'review_upload', label: '0a. 确认解析', isPause: true },
  { id: 'ingest', label: '1. 数据汇总' },
  { id: 'analyze', label: '2. AI 分析' },
  { id: 'review_analyze', label: '2a. 确认分析', isPause: true },
  { id: 'draft', label: '3. 生成草稿' },
  { id: 'review_draft', label: '3a. 审阅草稿', isPause: true },
  { id: 'ai_review', label: '4. AI Review' },
  { id: 'human_review', label: '5. 人工 Review', isPause: true },
  { id: 'post_edit_review', label: '6. 编辑后 Review' },
  { id: 'human_confirm', label: '6b. 人工确认', isPause: true },
  { id: 'localize', label: '7. 本地化' },
  { id: 'review_localize', label: '7a. 审阅本地化', isPause: true },
  { id: 'localize_ai_review', label: '7b. 本地化 Review' },
  { id: 'human_localize_review', label: '7c. 人工本地化审核', isPause: true },
  { id: 'dita_build', label: '8. 生成 DITA' },
  { id: 'review_dita', label: '8a. 审阅 DITA', isPause: true },
  { id: 'dita_ai_review', label: '8b. DITA AI Review' },
  { id: 'human_dita_review', label: '8c. 人工 DITA 审核', isPause: true },
  { id: 'export', label: '9. 导出' },
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
    title="工作流步骤"
    steps={STAGES}
    currentStep={currentStage}
    status={status}
    onGoBack={onGoBack ? (target) => onGoBack(target as StageName) : undefined}
    footer={
      <button
        onClick={onNewProject}
        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
      >
        + 新建项目
      </button>
    }
  />
);
