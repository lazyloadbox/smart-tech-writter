import React, { useState, useRef, useEffect } from 'react';
import { useLocalization, STAGE_LABELS } from './hooks/useLocalization';
import { ReviewPanel } from '../doc-generator/components/ReviewPanel';
import { XmlHighlight } from '../doc-generator/components/xml/XmlHighlight';
import { StepNavigation, type StepNavItem } from '../../components/StepNavigation';
import { LocalizePreviewModal } from './components/LocalizePreviewModal';
import { useMappingStore } from '../../stores/mapping.store';
import type { LocalizeLanguage } from '../../../shared/types/document.types';
import type { LocalizationStage, LocalizationFileResult } from '../../../shared/types/localization.types';

const LANG_OPTIONS: { value: LocalizeLanguage; label: string }[] = [
  { value: 'en', label: 'English（英文）' },
  { value: 'zh-CN', label: '简体中文（中国大陆）' },
  { value: 'zh-TW', label: '繁體中文（台灣）' },
];

/** Workflow steps shown in the left vertical navigation (mirrors doc-generator). */
const LOCALIZE_STEPS: StepNavItem[] = [
  { id: 'localize', label: '1. AI 翻译' },
  { id: 'review_localize', label: '1a. 人工审阅', isPause: true },
  { id: 'localize_ai_review', label: '2. AI 评审' },
  { id: 'human_localize_review', label: '2a. 人工审核', isPause: true },
  { id: 'post_edit_review', label: '3. AI 修改建议' },
  { id: 'human_confirm', label: '3a. 人工确认', isPause: true },
  { id: 'export', label: '4. 导出' },
];

const RUNNING_MESSAGES: Record<LocalizationStage, string> = {
  localize: 'AI 正在翻译 DITA 文档...',
  review_localize: '请审阅翻译结果...',
  localize_ai_review: 'AI 正在审查本地化质量...',
  human_localize_review: '请审核本地化结果...',
  post_edit_review: 'AI 正在根据人工修改给出建议...',
  human_confirm: '请确认最终结果...',
  export: '正在导出...',
};

export const LocalizationTab: React.FC = () => {
  const {
    files,
    targetLanguage,
    status,
    stage,
    currentFile,
    results,
    streamChunks,
    logs,
    exportResult,
    localizedDrafts,
    originalDrafts,
    reviewComments,
    postEditComments,
    selectFiles,
    start,
    continueFromReviewLocalize,
    submitHumanLocalizeReview,
    submitHumanConfirm,
    goBack,
    exportTo,
    setTargetLanguage,
    reset,
  } = useLocalization();

  const running = status === 'running';
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewResult, setPreviewResult] = useState<LocalizationFileResult | null>(null);

  // Streaming viewer shows the file currently being processed.
  const activeFile = currentFile ?? files[files.length - 1] ?? '';
  const fileStream = streamChunks.filter((c) => c.fileName === activeFile);
  const thinkingText = fileStream.filter((c) => c.type === 'thinking').map((c) => c.text).join('');
  const contentText = fileStream.filter((c) => c.type === 'content').map((c) => c.text).join('');

  // Auto-scroll the running content area so the latest AI stream output stays visible.
  const runningScrollRef = useRef<HTMLDivElement>(null);
  const [runningAutoScroll, setRunningAutoScroll] = useState(true);
  useEffect(() => {
    if (running && runningAutoScroll && runningScrollRef.current) {
      runningScrollRef.current.scrollTop = runningScrollRef.current.scrollHeight;
    }
  }, [streamChunks, running, runningAutoScroll]);

  const handleRunningScroll = () => {
    const el = runningScrollRef.current;
    if (!el) return;
    setRunningAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  // Auto-scroll the thinking area so the latest reasoning text is always visible.
  const thinkingScrollRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (thinkingScrollRef.current) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [thinkingText]);

  const langLabel = LANG_OPTIONS.find((o) => o.value === targetLanguage)?.label ?? targetLanguage;

  // Load translation-mapping stats so the IDLE view can show how many glossary
  // entries will be referenced for the selected target language. Each glossary
  // row carries both zh-CN and zh-TW translations; for the en target both
  // Chinese columns can be used as the source (reverse translation).
  const mappingStats = useMappingStore((s) => s.stats);
  useEffect(() => {
    if (!useMappingStore.getState().loaded) useMappingStore.getState().load();
  }, []);
  const mappingCount =
    targetLanguage === 'en'
      ? (mappingStats?.total ?? 0) * 2
      : (mappingStats?.total ?? 0);

  const handleGoBack = (target: string) => goBack(target as LocalizationStage);

  // ─── Header (shared across all states) ───
  const header = (
    <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
      <h2 className="text-sm font-semibold text-gray-200">🌐 DITA 本地化</h2>
      <span className="text-xs text-gray-500">完整复刻文档生成的本地化工作流</span>
      <div className="flex-1" />
    </div>
  );

  const renderContent = () => {
    // ─── IDLE: input section ───
    if (status === 'idle') {
      return (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto px-6 py-6 space-y-6">
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectFiles}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                >
                  📂 选择 DITA 文件
                </button>
                <span className="text-xs text-gray-400">
                  {files.length > 0 ? `已选择 ${files.length} 个文件` : '支持多选 .dita 文件'}
                </span>
              </div>

              {files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {files.map((f) => (
                    <span key={f} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">
                      {f.split(/[\\/]/).pop()}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-gray-300 whitespace-nowrap">🌐 目标语言</span>
                <div className="flex flex-wrap gap-1.5">
                  {LANG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTargetLanguage(opt.value)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        targetLanguage === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={start}
                  disabled={files.length === 0}
                  className="ml-auto px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                >
                  ▶ 开始翻译
                </button>
              </div>
            </section>

            {/* Translation mapping hint */}
            <section className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-base">🔁</span>
              <div className="text-xs text-gray-400 leading-relaxed">
                <span className="text-gray-300">翻译映射（术语表）：</span>
                当前语言
                <span className="text-gray-200 font-medium"> {langLabel} </span>
                已配置
                <span className={mappingCount > 0 ? 'text-blue-300 font-semibold' : 'text-gray-500'}>
                  {mappingCount}
                </span>
                条映射。翻译时 AI 会自动参考这些已确认的术语翻译，保证术语一致性。
                <span className="text-gray-500">（可在「设置 → 翻译映射」中维护，支持 Excel 导入）</span>
              </div>
            </section>

            {/* Workflow explanation */}
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-2">📋 工作流说明</h3>
              <ol className="list-decimal list-inside text-xs text-gray-400 space-y-1.5 leading-relaxed">
                <li><span className="text-gray-300">AI 翻译</span> — 将每个 DITA 文件翻译为目标语言（保留 XML 结构）</li>
                <li><span className="text-gray-300">人工审阅</span> — 对照原文检查翻译结果，可直接修改译文</li>
                <li><span className="text-gray-300">AI 评审</span> — AI 审查翻译准确性、术语一致性与语言流畅度</li>
                <li><span className="text-gray-300">人工审核</span> — 接受/拒绝 AI 建议并直接编辑译文</li>
                <li><span className="text-gray-300">AI 修改建议</span> — 人工编辑后 AI 复查，给出进一步修改建议</li>
                <li><span className="text-gray-300">人工确认</span> — 处理最终建议并确认结果</li>
                <li><span className="text-gray-300">导出</span> — 选择目录导出 &lt;文件名&gt;.&lt;语言&gt;.dita</li>
              </ol>
            </section>
          </div>
        </div>
      );
    }

    // ─── RUNNING: AI stages ───
    if (running) {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="shrink-0 px-4 py-2 flex items-center gap-2 text-xs text-blue-300 border-b border-gray-700/60">
            <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span>{RUNNING_MESSAGES[stage]}</span>
            <span className="text-gray-500">· {STAGE_LABELS[stage]}</span>
          </div>
          <div
            ref={runningScrollRef}
            onScroll={handleRunningScroll}
            className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4"
          >
            {/* Streaming viewer for the current file */}
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-2">
                {activeFile ? `⏳ ${STAGE_LABELS[stage]}：${activeFile.split(/[\\/]/).pop()}` : STAGE_LABELS[stage]}
              </h3>
              {thinkingText && (
                <details open className="mb-2">
                  <summary className="text-xs text-amber-400/80 italic cursor-pointer select-none">思考过程</summary>
                  <pre
                    ref={thinkingScrollRef}
                    className="mt-1 max-h-60 overflow-y-auto text-xs text-amber-300/70 italic whitespace-pre-wrap break-words font-mono"
                  >
                    {thinkingText}
                  </pre>
                </details>
              )}
              <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono">
                {contentText || '等待输出…'}
              </pre>
            </section>

            {/* Logs */}
            {logs.length > 0 && (
              <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-200 mb-2">进度日志</h3>
                <div className="space-y-1">
                  {logs.map((l) => (
                    <div key={l.id} className="text-xs flex gap-2">
                      <span className="text-gray-500 shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                      <span
                        className={
                          l.level === 'error'
                            ? 'text-red-400'
                            : l.level === 'warn'
                              ? 'text-yellow-400'
                              : 'text-gray-300'
                        }
                      >
                        {l.message}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="shrink-0 px-6 py-2 border-t border-gray-700/60 bg-gray-900/70 flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            正在处理中，请稍候...
          </div>
        </div>
      );
    }

    // ─── PAUSED:REVIEW_LOCALIZE — editable side-by-side review ───
    if (status === 'paused:review_localize') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">🌐 AI 本地化结果 — 请审阅并修改后继续</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{results.length} 个文件 · {langLabel}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={localizedDrafts}
              comments={[]}
              leftPanel="original"
              originalDrafts={originalDrafts}
              onSubmit={(editedDrafts) => continueFromReviewLocalize(editedDrafts)}
              title="本地化结果（可直接编辑）"
              submitLabel="▶ 确认，进入 AI 本地化评审"
              editorMode="xml"
              footerLeft={
                <button
                  onClick={() => goBack('localize')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
                >
                  ↩ 返回重新翻译
                </button>
              }
            />
          </div>
        </div>
      );
    }

    // ─── PAUSED:HUMAN_LOCALIZE_REVIEW — accept/reject AI suggestions + edit ───
    if (status === 'paused:human_localize_review') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">人工本地化审核 — 接受/拒绝 AI 建议并编辑</h2>
            <div className="flex-1" />
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              {showOriginal ? '隐藏原文' : '查看原文'}
            </button>
            <button
              onClick={() => goBack('localize_ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ 返回 AI 评审
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {showOriginal && (
              <div className="w-1/3 shrink-0 border-r border-gray-700 overflow-y-auto p-4">
                <p className="text-xs text-gray-400 mb-2 font-semibold">📄 原文（只读）</p>
                {originalDrafts.map((d) => (
                  <div key={d.id} className="mb-4">
                    <h3 className="text-sm font-medium text-gray-200 mb-2">{d.title}</h3>
                    <XmlHighlight code={d.content} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 min-w-0 overflow-hidden">
              <ReviewPanel
                drafts={localizedDrafts}
                comments={reviewComments}
                onSubmit={(editedDrafts, acceptedIds) => submitHumanLocalizeReview(editedDrafts, acceptedIds)}
                title="本地化结果（可编辑）"
                submitLabel="确认修改，进入 AI 修改建议 ▶"
                editorMode="xml"
              />
            </div>
          </div>
        </div>
      );
    }

    // ─── PAUSED:HUMAN_CONFIRM — final review of post-edit suggestions ───
    if (status === 'paused:human_confirm') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">人工最终确认 — 处理 AI 修改建议</h2>
            <div className="flex-1" />
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              {showOriginal ? '隐藏原文' : '查看原文'}
            </button>
            <button
              onClick={() => goBack('post_edit_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ 返回人工审核
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {showOriginal && (
              <div className="w-1/3 shrink-0 border-r border-gray-700 overflow-y-auto p-4">
                <p className="text-xs text-gray-400 mb-2 font-semibold">📄 原文（只读）</p>
                {originalDrafts.map((d) => (
                  <div key={d.id} className="mb-4">
                    <h3 className="text-sm font-medium text-gray-200 mb-2">{d.title}</h3>
                    <XmlHighlight code={d.content} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 min-w-0 overflow-hidden">
              <ReviewPanel
                drafts={localizedDrafts}
                comments={postEditComments}
                onSubmit={(editedDrafts, acceptedIds) => submitHumanConfirm(editedDrafts, acceptedIds)}
                title="最终结果（可编辑）"
                submitLabel="✅ 确认完成，导出文件 ▶"
                editorMode="xml"
              />
            </div>
          </div>
        </div>
      );
    }

    // ─── DONE: results + export ───
    if (status === 'done') {
      return (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto px-6 py-6 space-y-6">
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-1">✅ 翻译完成</h3>
              <p className="text-xs text-gray-500 mb-3">
                导出文件名格式：&lt;文件名&gt;.&lt;语言&gt;.dita（如 {results[0]?.exportFileName ?? '综合技术文档.zh-TW.dita'}）
              </p>
              <div className="divide-y divide-gray-700">
                {results.map((r) => (
                  <div key={r.sourcePath} className="py-2.5 flex items-center gap-3">
                    <span className={r.status === 'done' ? 'text-green-400' : 'text-red-400'}>
                      {r.status === 'done' ? '✅' : '❌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">{r.fileName}</div>
                      {r.status === 'done' && (
                        <div className="text-xs text-gray-500 truncate">
                          导出为 <span className="text-gray-300 font-mono">{r.exportFileName}</span>
                        </div>
                      )}
                      <div className="text-xs mt-0.5">
                        {r.status === 'done' ? (
                          r.validated ? (
                            r.repaired ? (
                              <span className="text-amber-400">⚠️ 已自动修复 XML 问题</span>
                            ) : (
                              <span className="text-green-400">✅ XML 校验通过</span>
                            )
                          ) : (
                            <span className="text-red-400">❌ XML 校验未通过</span>
                          )
                        ) : (
                          <span className="text-red-400">{r.error ?? '未知错误'}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {r.reviewComments.length} 条评审 · {r.postEditComments.length} 条修改建议
                    </span>
                    {r.status === 'done' && (
                      <button
                        onClick={() => setPreviewResult(r)}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors shrink-0"
                      >
                        👁 查看
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={exportTo}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                >
                  📁 选择目录并导出
                </button>
                {exportResult && (
                  <span className="text-xs text-green-400">
                    已导出 {exportResult.count} 个文件到 {exportResult.destDir}
                  </span>
                )}
              </div>
            </section>
          </div>
        </div>
      );
    }

    // ─── FAILED ───
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="p-4 bg-red-900/30 border border-red-700 rounded">
            <p className="text-red-400 font-medium">❌ 本地化失败</p>
            <p className="text-red-300 text-sm mt-1">
              部分文件翻译失败，请检查文件内容或 AI 服务配置后重试。
            </p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 divide-y divide-gray-700">
            {results.map((r) => (
              <div key={r.sourcePath} className="py-2 text-sm">
                <span className="text-gray-200">{r.fileName}</span>
                {r.status === 'failed' && r.error && (
                  <span className="text-red-400 text-xs ml-2">{r.error}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => goBack('localize')}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-sm text-gray-200 rounded transition-colors"
            >
              ↩ 返回重新翻译
            </button>
            <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 rounded">
              重新开始
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900">
      {header}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <StepNavigation
          title="本地化步骤"
          steps={LOCALIZE_STEPS}
          currentStep={stage}
          status={status}
          onGoBack={running ? undefined : handleGoBack}
          footer={
            <button
              onClick={reset}
              className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              ↺ 新建翻译
            </button>
          }
        />
        <div className="flex-1 overflow-hidden">{renderContent()}</div>
      </div>
      {previewResult && (
        <LocalizePreviewModal result={previewResult} onClose={() => setPreviewResult(null)} />
      )}
    </div>
  );
};