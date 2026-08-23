import React, { useEffect, useState } from 'react';
import { TABS, type TabId } from '../../navigation';
import type { Project } from '../../../shared/types/workflow.types';
import type { LocalizeRun } from '../../../shared/types/localization.types';
import { useWorkflowStore } from '../../stores/workflow.store';
import { useLocalizationStore } from '../../stores/localization.store';

interface OverviewTabProps {
  onNavigate: (tab: TabId) => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: '已完成', className: 'bg-green-500/20 text-green-400' },
  FAILED: { label: '失败', className: 'bg-red-500/20 text-red-400' },
  RUNNING: { label: '运行中', className: 'bg-blue-500/20 text-blue-400' },
  IDLE: { label: '空闲', className: 'bg-gray-600/30 text-gray-400' },
  'PAUSED:USER': { label: '已暂停', className: 'bg-yellow-500/20 text-yellow-400' },
};

const DOCGEN_STAGE_LABELS: Record<string, string> = {
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

const LOCALIZE_STAGE_LABELS: Record<string, string> = {
  localize: 'AI 翻译',
  review_localize: '人工审阅',
  localize_ai_review: 'AI 本地化评审',
  human_localize_review: '人工本地化审核',
  post_edit_review: 'AI 修改建议',
  human_confirm: '人工最终确认',
  export: '导出',
};

const LOCALIZE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  idle: { label: '空闲', className: 'bg-gray-600/30 text-gray-400' },
  running: { label: '运行中', className: 'bg-blue-500/20 text-blue-400' },
  'paused:review_localize': { label: '待人工审阅', className: 'bg-yellow-500/20 text-yellow-400' },
  'paused:human_localize_review': { label: '待人工审核', className: 'bg-yellow-500/20 text-yellow-400' },
  'paused:human_confirm': { label: '待人工确认', className: 'bg-yellow-500/20 text-yellow-400' },
  done: { label: '已完成', className: 'bg-green-500/20 text-green-400' },
  failed: { label: '失败', className: 'bg-red-500/20 text-red-400' },
};

function statusBadge(status: string) {
  const s = STATUS_LABELS[status] ?? { label: status, className: 'bg-gray-600/30 text-gray-400' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function localizeStatusBadge(status: string) {
  const s = LOCALIZE_STATUS_LABELS[status] ?? { label: status, className: 'bg-gray-600/30 text-gray-400' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigate }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<LocalizeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [projList, runList] = await Promise.all([
        window.electronAPI.projects.list(),
        window.electronAPI.localization.listRuns(),
      ]);
      setProjects(projList);
      setRuns(runList);
    } catch (err) {
      console.error('[Overview] Failed to load records', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleDeleteProject = async (id: string) => {
    try {
      await window.electronAPI.projects.delete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('[Overview] Failed to delete project', err);
    }
  };

  const handleDeleteRun = async (id: string) => {
    try {
      await window.electronAPI.localization.deleteRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('[Overview] Failed to delete run', err);
    }
  };

  const handleOpenProject = async (id: string) => {
    setOpeningId(id);
    try {
      const state = await window.electronAPI.projects.getState(id);
      if (!state) {
        console.error('[Overview] Project state not found', { id });
        return;
      }
      // Restore the full workflow state into the store, then jump to the
      // Doc Generator tab — it renders the correct stage from currentStage/status.
      useWorkflowStore.setState({
        ...state,
        workflowLogs: state.workflowLogs ?? [],
        streamChunks: [],
        currentProgressMessage: '',
      });
      onNavigate('doc-generator');
    } catch (err) {
      console.error('[Overview] Failed to open project', err);
    } finally {
      setOpeningId(null);
    }
  };

  const handleOpenRun = async (id: string) => {
    setOpeningId(id);
    try {
      // loadRun restores the run into the main-process service; the returned
      // state is then mirrored into the renderer store so the Localization tab
      // renders the correct stage.
      const run = await window.electronAPI.localization.loadRun(id);
      if (!run) {
        console.error('[Overview] Run not found', { id });
        return;
      }
      useLocalizationStore.setState({
        files: run.results.map((r) => r.sourcePath),
        targetLanguage: run.targetLanguage,
        status: run.status,
        stage: run.stage,
        currentFile: null,
        results: run.results,
        streamChunks: [],
        logs: [],
        exportResult: null,
      });
      onNavigate('localization');
    } catch (err) {
      console.error('[Overview] Failed to open run', err);
    } finally {
      setOpeningId(null);
    }
  };

  const featureTabs = TABS.filter((t) => t.id !== 'overview');

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-900">
      <div className="max-w-5xl w-full mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-100">总览</h1>
          <p className="text-sm text-gray-400 mt-1">Smart Tech Writer 功能入口与工作记录</p>
        </div>

        {/* Feature cards */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">功能</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featureTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className="text-left bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-blue-400 hover:bg-gray-700 transition-colors group"
              >
                <div className="text-2xl mb-2">{tab.icon}</div>
                <div className="text-sm font-semibold text-gray-100 group-hover:text-blue-400">{tab.label}</div>
                <div className="text-xs text-gray-400 mt-1">{tab.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Recent projects (Doc Generator) */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">📄 最近项目（Doc Generator）</h2>
            <button onClick={() => onNavigate('doc-generator')} className="text-xs text-blue-400 hover:underline">
              新建项目 →
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-500">加载中…</div>
            ) : projects.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                暂无项目。前往{' '}
                <button className="text-blue-400 hover:underline" onClick={() => onNavigate('doc-generator')}>
                  Doc Generator
                </button>{' '}
                开始生成文档。
              </div>
            ) : (
              <div className="h-64 overflow-y-auto divide-y divide-gray-700">
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        更新于 {formatTime(p.updatedAt)} · {DOCGEN_STAGE_LABELS[p.currentStage] ?? p.currentStage}
                      </div>
                    </div>
                    {statusBadge(p.status)}
                    <button
                      onClick={() => handleOpenProject(p.id)}
                      disabled={openingId === p.id}
                      className="shrink-0 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
                      title="打开并继续该项目"
                    >
                      {openingId === p.id ? '打开中…' : p.status === 'COMPLETED' ? '打开' : '继续'}
                    </button>
                    <button
                      onClick={() => handleDeleteProject(p.id)}
                      className="shrink-0 px-2 py-1 text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="删除项目"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Localization runs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">🌐 本地化记录</h2>
            <button onClick={() => onNavigate('localization')} className="text-xs text-blue-400 hover:underline">
              新建翻译 →
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-500">加载中…</div>
            ) : runs.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                暂无本地化记录。前往{' '}
                <button className="text-blue-400 hover:underline" onClick={() => onNavigate('localization')}>
                  本地化
                </button>{' '}
                开始翻译 DITA 文件。
              </div>
            ) : (
              <div className="h-64 overflow-y-auto divide-y divide-gray-700">
                {runs.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">
                        本地化 · {r.fileCount} 个文件 → {r.targetLanguage}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        更新于 {formatTime(r.updatedAt)} · {LOCALIZE_STAGE_LABELS[r.stage] ?? r.stage}
                      </div>
                    </div>
                    {localizeStatusBadge(r.status)}
                    <button
                      onClick={() => handleOpenRun(r.id)}
                      disabled={openingId === r.id}
                      className="shrink-0 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
                      title="打开并继续该本地化记录"
                    >
                      {openingId === r.id ? '打开中…' : r.status === 'done' ? '打开' : '继续'}
                    </button>
                    <button
                      onClick={() => handleDeleteRun(r.id)}
                      className="shrink-0 px-2 py-1 text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="删除记录"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};