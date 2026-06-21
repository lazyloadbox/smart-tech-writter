import React from 'react';
import type { StageName, WorkflowStatus } from '../../../../shared/types/workflow.types';

interface WorkflowProgressProps {
  stage: StageName;
  status: WorkflowStatus;
  message?: string;
}

const STAGE_LABELS: Record<StageName, string> = {
  upload_parse: '上传 & 解析',
  review_upload: '确认解析结果',
  ingest: '数据汇总',
  analyze: 'AI 分析',
  review_analyze: '确认分析结果',
  draft: '生成草稿',
  review_draft: '审阅草稿',
  ai_review: 'AI Review',
  human_review: '人工 Review',
  post_edit_review: '编辑后 Review',
  human_confirm: '人工确认',
  localize: '本地化',
  review_localize: '审阅本地化结果',
  localize_ai_review: '本地化 Review',
  human_localize_review: '人工本地化审核',
  dita_build: '生成 DITA',
  review_dita: '审阅 DITA 结果',
  dita_ai_review: 'DITA AI Review',
  human_dita_review: '人工 DITA 审核',
  export: '导出',
};

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({ stage, status, message }) => {
  const isRunning = status === 'RUNNING';
  const isPaused = status.startsWith('PAUSED');
  const isCompleted = status === 'COMPLETED';
  const isFailed = status === 'FAILED';

  return (
    <div className="p-4 bg-gray-800 rounded border border-gray-700">
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isRunning ? 'bg-blue-400 animate-pulse' :
            isPaused ? 'bg-yellow-400' :
            isCompleted ? 'bg-green-400' :
            isFailed ? 'bg-red-400' : 'bg-gray-500'
          }`}
        />
        <div>
          <div className="text-sm font-medium text-gray-200">
            {STAGE_LABELS[stage] ?? stage}
            <span className="ml-2 text-xs text-gray-400">
              {isRunning && '运行中...'}
              {isPaused && '⏸ 等待人工操作'}
              {isCompleted && '✅ 完成'}
              {isFailed && '❌ 失败'}
            </span>
          </div>
          {message && <div className="text-xs text-gray-400 mt-0.5">{message}</div>}
        </div>
      </div>
    </div>
  );
};
