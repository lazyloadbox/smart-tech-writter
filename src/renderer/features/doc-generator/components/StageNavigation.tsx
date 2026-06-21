import React from 'react';
import type { StageName, WorkflowStatus } from '../../../../shared/types/workflow.types';

interface StageNavItem {
  id: StageName;
  label: string;
  isPause?: boolean;
}

const STAGES: StageNavItem[] = [
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

const STAGE_ORDER = STAGES.map((s) => s.id);

interface StageNavigationProps {
  currentStage: StageName;
  status: WorkflowStatus;
  onNewProject: () => void;
  onGoBack?: (targetStage: StageName) => void;
}

export const StageNavigation: React.FC<StageNavigationProps> = ({
  currentStage,
  status,
  onNewProject,
  onGoBack,
}) => {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="w-52 shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">工作流步骤</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {STAGES.map((stage, idx) => {
          const isActive = stage.id === currentStage;
          const isDone = idx < currentIdx;
          const isPaused = isActive && status.startsWith('PAUSED');
          const canGoBack = isDone && onGoBack && status !== 'IDLE';

          return (
            <div
              key={stage.id}
              onClick={() => canGoBack && onGoBack?.(stage.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                isActive
                  ? isPaused
                    ? 'bg-yellow-900/50 text-yellow-300 font-medium'
                    : 'bg-blue-900/50 text-blue-300 font-medium'
                  : isDone
                  ? canGoBack
                    ? 'text-green-400 cursor-pointer hover:bg-green-900/30 transition-colors'
                    : 'text-green-400'
                  : 'text-gray-500'
              }`}
              title={canGoBack ? `点击返回: ${stage.label}` : stage.label}
            >
              <span className="shrink-0 text-xs">
                {isDone ? '✓' : isActive ? (isPaused ? '⏸' : '▶') : '○'}
              </span>
              <span className="truncate">{stage.label}</span>
              {stage.isPause && !isDone && !isActive && (
                <span className="ml-auto text-yellow-600 text-xs">⏸</span>
              )}
              {canGoBack && (
                <span className="ml-auto text-green-500 text-[10px] opacity-60">↩</span>
              )}
            </div>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={onNewProject}
          className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
        >
          + 新建项目
        </button>
      </div>
    </div>
  );
};
