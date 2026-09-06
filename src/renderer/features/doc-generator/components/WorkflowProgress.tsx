import React from 'react';
import type { StageName, WorkflowStatus } from '../../../../shared/types/workflow.types';
import { en as ui } from '../../../../shared/i18n';

interface WorkflowProgressProps {
  stage: StageName;
  status: WorkflowStatus;
  message?: string;
}

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
            {ui.workflow.stages[stage] ?? stage}
            <span className="ml-2 text-xs text-gray-400">
              {isRunning && ui.workflow.running.running}
              {isPaused && `⏸ ${ui.workflow.running.paused}`}
              {isCompleted && `✅ ${ui.workflow.running.completed}`}
              {isFailed && `❌ ${ui.workflow.running.failed}`}
            </span>
          </div>
          {message && <div className="text-xs text-gray-400 mt-0.5">{message}</div>}
        </div>
      </div>
    </div>
  );
};
