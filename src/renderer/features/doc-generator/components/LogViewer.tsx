import React, { useState, useRef, useEffect } from 'react';
import type { WorkflowLogEntry } from '../../../../shared/types/workflow.types';

interface LogViewerProps {
  logs: WorkflowLogEntry[];
}

const STAGE_LABELS_SHORT: Record<string, string> = {
  upload_parse: '解析',
  review_upload: '确认解析',
  ingest: '汇总',
  analyze: '分析',
  review_analyze: '确认分析',
  draft: '草稿',
  review_draft: '审阅草稿',
  ai_review: '审查',
  human_review: '人工审查',
  post_edit_review: '编辑后审查',
  human_confirm: '确认',
  localize: '本地化',
  review_localize: '审阅本地化',
  localize_ai_review: '本地化审查',
  human_localize_review: '人工本地审查',
  dita_build: '生成 DITA',
  review_dita: '审阅 DITA',
  dita_ai_review: 'DITA 审查',
  human_dita_review: '人工 DITA 审查',
  export: '导出',
};

const LEVEL_STYLES: Record<string, string> = {
  info: 'text-gray-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-500',
};

const LEVEL_ICONS: Record<string, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  debug: '🔍',
};

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  };

  const lastLog = logs[logs.length - 1];

  return (
    <div className="border-t border-gray-700 bg-gray-900 shadow-lg shadow-black/50">
      {/* Collapse header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-gray-800 transition-colors text-left bg-gray-900"
      >
        <span className="text-xs text-gray-400">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="text-xs font-medium text-gray-300">
          📋 工作流日志
        </span>
        <span className="text-xs text-gray-500">({logs.length} 条)</span>
        {!isExpanded && lastLog && (
          <span className={`text-xs truncate ml-2 ${LEVEL_STYLES[lastLog.level] ?? 'text-gray-400'}`}>
            — {lastLog.message}
          </span>
        )}
      </button>

      {/* Expanded log list */}
      {isExpanded && (
        <div className="flex flex-col" style={{ maxHeight: '200px' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-1 bg-gray-800 border-b border-gray-700">
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3 h-3"
              />
              自动滚动
            </label>
            <button
              onClick={() => {
                if (listRef.current) {
                  listRef.current.scrollTop = listRef.current.scrollHeight;
                }
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              滚动到底部
            </button>
          </div>

          {/* Log entries */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="overflow-y-auto flex-1"
          >
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-500">
                暂无日志，启动工作流后将在此显示详细过程
              </div>
            ) : (
              <div className="font-mono text-[11px] leading-relaxed">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 px-4 py-0.5 hover:bg-gray-800/50 border-b border-gray-800 last:border-0"
                  >
                    <span className="text-gray-600 shrink-0 w-16 text-right">
                      {new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span className="text-gray-600 shrink-0 w-16 text-center">
                      [{STAGE_LABELS_SHORT[entry.stage] ?? entry.stage}]
                    </span>
                    <span className="shrink-0">{LEVEL_ICONS[entry.level] ?? '·'}</span>
                    <span className={LEVEL_STYLES[entry.level] ?? 'text-gray-400'}>
                      {entry.message}
                    </span>
                    {entry.detail && (
                      <span className="text-gray-600 ml-1 hidden lg:inline truncate">
                        {entry.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
