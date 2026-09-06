import React from 'react';
import { en as ui } from '../../shared/i18n';

/** A single step shown in the vertical step navigation sidebar. */
export interface StepNavItem {
  /** Unique step id (matches the feature's stage/step type). */
  id: string;
  /** Display label, e.g. "1. AI translation". */
  label: string;
  /** Whether this step pauses for human interaction. */
  isPause?: boolean;
}

interface StepNavigationProps {
  /** Sidebar title, e.g. "Workflow steps". */
  title?: string;
  /** Ordered list of steps. */
  steps: StepNavItem[];
  /** The current step id. */
  currentStep: string;
  /**
   * Feature status string. Paused detection is case-insensitive so both
   * `PAUSED:...` (workflow) and `paused:...` (localization) work.
   */
  status: string;
  /** Called when the user clicks a completed step to go back. */
  onGoBack?: (targetStep: string) => void;
  /** Optional footer content (e.g. a "New project" / "New translation" button). */
  footer?: React.ReactNode;
  /** Sidebar width class (default `w-52`). */
  widthClass?: string;
}

/**
 * Shared vertical step-status navigation sidebar.
 *
 * Renders an ordered list of workflow steps with done/active/paused states,
 * mirroring the doc-generator's left-side stage navigation. Abstracted so any
 * feature with a multi-step workflow (doc-generator, localization, future
 * tools) can reuse the same visual language.
 */
export const StepNavigation: React.FC<StepNavigationProps> = ({
  title = ui.common.workflowSteps,
  steps,
  currentStep,
  status,
  onGoBack,
  footer,
  widthClass = 'w-52',
}) => {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);
  const isPausedStatus = status.toLowerCase().startsWith('paused');
  const isIdle = status.toLowerCase() === 'idle';

  return (
    <div className={`${widthClass} shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col overflow-y-auto`}>
      <div className="p-3 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">{title}</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {steps.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isDone = idx < currentIdx;
          const isPaused = isActive && isPausedStatus;
          const canGoBack = isDone && !!onGoBack && !isIdle;

          return (
            <div
              key={step.id}
              onClick={() => canGoBack && onGoBack?.(step.id)}
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
              title={canGoBack ? `Go back to ${step.label}` : step.label}
            >
              <span className="shrink-0 text-xs">
                {isDone ? '✓' : isActive ? (isPaused ? '⏸' : '▶') : '○'}
              </span>
              <span className="truncate">{step.label}</span>
              {step.isPause && !isDone && !isActive && (
                <span className="ml-auto text-yellow-600 text-xs">⏸</span>
              )}
              {canGoBack && (
                <span className="ml-auto text-green-500 text-[10px] opacity-60">↩</span>
              )}
            </div>
          );
        })}
      </nav>
      {footer && <div className="p-3 border-t border-gray-700">{footer}</div>}
    </div>
  );
};
