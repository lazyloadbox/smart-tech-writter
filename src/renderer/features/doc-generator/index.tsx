import React, { useState } from 'react';
import { useWorkflow } from './hooks/useWorkflow';
import { StageNavigation } from './components/StageNavigation';
import { InputPanel } from './components/InputPanel';
import { WorkflowProgress } from './components/WorkflowProgress';
import { DraftViewer } from './components/DraftViewer';
import { ReviewPanel } from './components/ReviewPanel';
import { OutputPanel } from './components/OutputPanel';
import { LogViewer } from './components/LogViewer';
import { AIStreamViewer } from './components/AIStreamViewer';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { CollapsibleSection } from './components/CollapsibleSection';
import type { UploadedFile, LocalizeLanguage } from '../../../shared/types/document.types';
import type { StageName } from '../../../shared/types/workflow.types';

const LANG_OPTIONS: { value: LocalizeLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文（中国大陆）' },
  { value: 'zh-TW', label: '繁體中文（台灣 / 台湾）' },
  { value: 'zh-HK', label: '繁體中文（香港）' },
];

export const DocGeneratorTab: React.FC = () => {
  const { state, startWorkflow, goBack, submitHumanReview, submitHumanConfirm, submitHumanLocalize, submitHumanDita, reviewContinue, setTargetLanguage } = useWorkflow();
  const [isStarting, setIsStarting] = useState(false);
  const [localFiles, setLocalFiles] = useState<UploadedFile[]>([]);
  const [selectedLang, setSelectedLang] = useState<LocalizeLanguage>('zh-CN');
  const [skipLocalize, setSkipLocalize] = useState(false);

  const handleFilesAdded = (newFiles: UploadedFile[]) => {
    setLocalFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.path))];
    });
  };

  const handleRemoveFile = (id: string) => {
    setLocalFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleStartWorkflow = async (filePaths: string[]) => {
    console.info('[WF][UI] Start button clicked', { fileCount: filePaths.length, filePaths });
    setIsStarting(true);
    try {
      await startWorkflow(filePaths);
      console.info('[WF][UI] Workflow start request completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WF][UI] Workflow start failed', err);
      state.setState({
        status: 'FAILED',
        error: `启动工作流失败: ${message}`,
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleNewProject = () => {
    setLocalFiles([]);
    setSkipLocalize(false);
    setSelectedLang('zh-CN');
    state.reset();
  };

  const handleGoBack = (targetStage: StageName) => {
    console.info('[WF][UI] Go back requested', { targetStage });
    goBack(targetStage);
  };

  const renderContent = () => {
    const { currentStage, status } = state;

    // Not started yet
    if (status === 'IDLE') {
      return (
        <InputPanel
          files={status === 'IDLE' ? localFiles : state.inputFiles}
          onFilesAdded={handleFilesAdded}
          onRemoveFile={handleRemoveFile}
          onStartWorkflow={handleStartWorkflow}
          isStarting={isStarting}
        />
      );
    }

    // Running stages (non-interactive) — show detailed progress
    if (status === 'RUNNING') {
      return (
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3">
            <WorkflowProgress
              stage={currentStage}
              status={status}
              message={
                currentStage === 'upload_parse' ? '正在读取并解析文件...' :
                currentStage === 'ingest' ? '正在汇总结构化数据...' :
                currentStage === 'analyze' ? 'AI 正在分析文档内容...' :
                currentStage === 'draft' ? 'AI 正在生成文档草稿...' :
                currentStage === 'ai_review' ? 'AI 正在进行质量审查...' :
                currentStage === 'post_edit_review' ? 'AI 正在进行编辑后审查...' :
                currentStage === 'localize' ? `AI 正在本地化为 ${
                  state.targetLanguage === 'zh-TW' ? '繁體中文（台灣）' :
                  state.targetLanguage === 'zh-HK' ? '繁體中文（香港）' : '简体中文'
                }...` :
                currentStage === 'localize_ai_review' ? 'AI 正在审查本地化质量...' :
                currentStage === 'dita_build' ? '正在生成 DITA XML 文档...' :
                currentStage === 'dita_ai_review' ? 'AI 正在审查 DITA XML 结构...' :
                currentStage === 'export' ? '正在写入 DITA 文件...' :
                '处理中...'
              }
            />
            {/* Back button — allow going back to previous stage */}
            {currentStage !== 'upload_parse' && (
              <button
                onClick={() => {
                  const stages: StageName[] = [
                    'upload_parse', 'review_upload', 'ingest', 'analyze', 'review_analyze',
                    'draft', 'review_draft', 'ai_review',
                    'human_review', 'post_edit_review', 'human_confirm',
                    'localize', 'review_localize', 'localize_ai_review', 'human_localize_review',
                    'dita_build', 'review_dita', 'dita_ai_review', 'human_dita_review', 'export',
                  ];
                  const idx = stages.indexOf(currentStage);
                  if (idx > 0) handleGoBack(stages[idx - 1]);
                }}
                className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
              >
                ↩ 返回上一步
              </button>
            )}
          </div>

          {/* Live progress detail (e.g. current file being processed) */}
          {state.currentProgressMessage && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/70 rounded border border-gray-700 text-xs text-blue-300">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span>{state.currentProgressMessage}</span>
            </div>
          )}

          {/* File list during upload_parse stage */}
          {currentStage === 'upload_parse' && state.inputFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">📂 待处理文件</p>
              {state.inputFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded text-xs">
                  <span className="text-gray-300 truncate flex-1">📄 {f.name}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                    f.parseStatus === 'done' ? 'bg-green-900/40 text-green-300' :
                    f.parseStatus === 'error' ? 'bg-red-900/40 text-red-300' :
                    f.parseStatus === 'parsing' ? 'bg-blue-900/40 text-blue-300 animate-pulse' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {f.parseStatus === 'done' ? '✓ 完成' :
                     f.parseStatus === 'error' ? '✗ 失败' :
                     f.parseStatus === 'parsing' ? '⟳ 解析中' : '等待中'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* AI Streaming Output */}
          <div className="max-h-80 overflow-y-auto">
            <AIStreamViewer
              chunks={state.streamChunks}
              currentStage={currentStage}
              isRunning={status === 'RUNNING'}
            />
          </div>

          {/* Show live draft preview during draft/review stages */}
          {(currentStage === 'draft' || currentStage === 'ai_review') && state.drafts.length > 0 && (
            <CollapsibleSection
              key={`draft-preview-${currentStage}`}
              title="📝 草稿预览（实时更新）"
              defaultExpanded={true}
            >
              <div className="max-h-96 overflow-y-auto">
                <DraftViewer drafts={state.drafts} />
              </div>
            </CollapsibleSection>
          )}
          {/* Show live DITA XML preview during dita_build / dita_ai_review stages */}
          {(currentStage === 'dita_build' || currentStage === 'dita_ai_review') && state.ditaDocuments.length > 0 && (
            <CollapsibleSection
              key={`dita-preview-${currentStage}`}
              title="📦 DITA XML 预览（实时更新）"
              defaultExpanded={true}
            >
              <div className="max-h-96 overflow-y-auto">
                {state.ditaDocuments.map((d) => (
                  <div key={d.id} className="mb-3">
                    <p className="text-xs text-gray-400 mb-1 font-medium">📄 {d.title}.dita</p>
                    <pre className="p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto whitespace-pre border border-gray-700">{d.content}</pre>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
          {/* Show analysis summary during analyze, draft, and review stages */}
          {(currentStage === 'analyze' || currentStage === 'draft' || currentStage === 'ai_review') && state.analysisResults.length > 0 && (
            <CollapsibleSection
              key={`analysis-${currentStage}`}
              title="🔍 分析结果"
              defaultExpanded={false}
            >
              <div className="max-h-80 overflow-y-auto space-y-2">
                {state.analysisResults.map((r) => (
                  <div key={r.fileId} className="p-3 bg-gray-800 rounded border border-gray-700">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-200">📄 {r.fileName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded">AI 解析</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{r.summary}</p>
                    {r.keyPoints && r.keyPoints.length > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] font-medium text-gray-500 uppercase">关键要点</span>
                        <ul className="list-disc list-inside text-xs text-gray-300 mt-0.5 space-y-0.5">
                          {r.keyPoints.map((kp, i) => (
                            <li key={i}>{kp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.technicalTerms && r.technicalTerms.length > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] font-medium text-gray-500 uppercase">技术术语</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.technicalTerms.map((term) => (
                            <span key={term} className="px-1.5 py-0.5 bg-green-900/40 text-green-300 text-[10px] rounded border border-green-800/50">
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.keywords.map((kw) => (
                          <span key={kw} className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 text-[10px] rounded">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
          {/* Show processing hint */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            正在处理中，请稍候... 详细过程请查看下方日志面板
          </div>
        </div>
      );
    }

    // ─── Review: Upload & Parse (after upload_parse, before ingest) ───
    if (status === 'PAUSED:REVIEW_UPLOAD') {
      const doneFiles = state.inputFiles.filter((f) => f.parseStatus === 'done');
      const errorFiles = state.inputFiles.filter((f) => f.parseStatus === 'error');
      const pendingFiles = state.inputFiles.filter((f) => f.parseStatus === 'pending' || f.parseStatus === 'parsing');
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">📂 文件解析结果 — 请确认后继续</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">✅ {doneFiles.length} 个成功</span>
            {errorFiles.length > 0 && <span className="text-xs text-red-400">❌ {errorFiles.length} 个失败</span>}
            {pendingFiles.length > 0 && <span className="text-xs text-yellow-400">⏳ {pendingFiles.length} 个未完成</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {state.inputFiles.map((f) => (
              <div key={f.id} className={`p-3 rounded border ${
                f.parseStatus === 'done' ? 'bg-gray-800 border-green-700/50' :
                f.parseStatus === 'error' ? 'bg-gray-800 border-red-700/50' :
                'bg-gray-800 border-yellow-700/50'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-200">📄 {f.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    f.parseStatus === 'done' ? 'bg-green-900/40 text-green-300' :
                    f.parseStatus === 'error' ? 'bg-red-900/40 text-red-300' :
                    'bg-yellow-900/40 text-yellow-300'
                  }`}>
                    {f.parseStatus === 'done' ? '已完成' : f.parseStatus === 'error' ? '失败' : '处理中'}
                  </span>
                </div>
                {f.parseSummary && <p className="text-xs text-gray-400 mt-1">📝 {f.parseSummary}</p>}
                {f.parseError && <p className="text-xs text-red-400 mt-1">⚠ {f.parseError}</p>}
                {f.extractedText && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">查看提取的文本 ({f.extractedText.length} 字符)</summary>
                    <pre className="mt-1 p-2 bg-gray-900 rounded text-xs text-gray-400 max-h-48 overflow-y-auto whitespace-pre-wrap">{f.extractedText.slice(0, 2000)}{f.extractedText.length > 2000 ? '\n... (截断)' : ''}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('upload_parse')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ 返回重新解析
            </button>
            <button onClick={() => reviewContinue('review_upload')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ 确认，继续汇总数据
            </button>
          </div>
        </div>
      );
    }

    // ─── Review: Analyze (after analyze, before draft) ───
    if (status === 'PAUSED:REVIEW_ANALYZE') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">🔍 AI 分析结果 — 请确认后继续</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{state.analysisResults.length} 个文件已分析</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {state.analysisResults.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">暂无分析结果</p>
            )}
            {state.analysisResults.map((r) => (
              <div key={r.fileId} className="p-4 bg-gray-800 rounded border border-gray-700">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
                  <span className="text-sm font-medium text-gray-200">📄 {r.fileName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded">AI 分析</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">{r.summary}</p>
                {r.keyPoints && r.keyPoints.length > 0 && (
                  <div className="mb-3">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">关键要点</span>
                    <ul className="list-disc list-inside text-xs text-gray-300 mt-1 space-y-0.5">
                      {r.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}
                    </ul>
                  </div>
                )}
                {r.technicalTerms && r.technicalTerms.length > 0 && (
                  <div className="mb-3">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">技术术语</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.technicalTerms.map((term) => (
                        <span key={term} className="px-1.5 py-0.5 bg-green-900/40 text-green-300 text-[10px] rounded border border-green-800/50">{term}</span>
                      ))}
                    </div>
                  </div>
                )}
                {r.keywords.length > 0 && (
                  <div>
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">关键词</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.keywords.map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 text-[10px] rounded">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {state.referenceSearchResults.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 mb-2">📚 参考资料 ({state.referenceSearchResults.length} 份)</p>
                <div className="space-y-2">
                  {state.referenceSearchResults.map((ref, i) => (
                    <div key={i} className="p-2.5 bg-gray-800/50 rounded border border-gray-700">
                      <p className="text-xs font-medium text-gray-300">{ref.fileName}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{ref.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('analyze')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ 返回重新分析
            </button>
            <button onClick={() => reviewContinue('review_analyze')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ 确认，开始生成草稿
            </button>
          </div>
        </div>
      );
    }

    // ─── Review: Draft (after draft, before ai_review) ───
    if (status === 'PAUSED:REVIEW_DRAFT') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">✍️ AI 生成草稿 — 请审阅后继续</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{state.drafts.length} 篇草稿</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <DraftViewer drafts={state.drafts} />
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('draft')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ 返回重新生成
            </button>
            <button onClick={() => reviewContinue('review_draft')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ 确认，进入 AI 质量审查
            </button>
          </div>
        </div>
      );
    }

    // ─── Review: Localize (after localize, before localize_ai_review) ───
    if (status === 'PAUSED:REVIEW_LOCALIZE') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">🌐 AI 本地化结果 — 请审阅后继续</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{state.localizedDrafts.length} 篇本地化草稿</span>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* Original */}
            <div className="flex-1 border-r border-gray-700 overflow-y-auto p-4">
              <p className="text-xs text-gray-400 mb-2 font-semibold">📄 原文（只读）</p>
              <MarkdownRenderer content={state.drafts[0]?.content ?? ''} />
            </div>
            {/* Localized */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs text-gray-400 mb-2 font-semibold">🌐 本地化结果</p>
              {state.localizedDrafts.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">暂无本地化结果</p>
              )}
              {state.localizedDrafts.map((d) => (
                <div key={d.id} className="mb-4">
                  <h3 className="text-sm font-medium text-gray-200 mb-2">{d.title}</h3>
                  <MarkdownRenderer content={d.content} />
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('localize')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ 返回重新本地化
            </button>
            <button onClick={() => reviewContinue('review_localize')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ 确认，进入本地化质量审查
            </button>
          </div>
        </div>
      );
    }

    // Human Review (Stage 5)
    if (status === 'PAUSED:HUMAN_REVIEW') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">Stage 5 — 人工审查 AI 建议</h2>
            <div className="flex-1" />
            <button
              onClick={() => handleGoBack('ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ 返回 AI Review
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={state.drafts}
              comments={state.aiReviewComments}
              onSubmit={submitHumanReview}
              title="Stage 5 — 人工审查 AI 建议"
              submitLabel="提交编辑，进入编辑后审查 ▶"
            />
          </div>
        </div>
      );
    }

    // Human Confirm (Stage 6b) — with language selection
    if (status === 'PAUSED:HUMAN_CONFIRM') {
      const confirmDrafts = state.humanEdits
        ? state.drafts.map((d, i) => i === 0 ? { ...d, content: state.humanEdits } : d)
        : state.drafts;

      const langFooter = (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-300 whitespace-nowrap">🌐 目标语言</span>
          <div className="flex flex-wrap gap-1.5">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setSelectedLang(opt.value);
                  setTargetLanguage(opt.value);
                  setSkipLocalize(false);
                }}
                disabled={skipLocalize}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  !skipLocalize && selectedLang === opt.value
                    ? 'bg-blue-600 text-white'
                    : skipLocalize
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {opt.label.split('（')[0]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 ml-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipLocalize}
              onChange={(e) => setSkipLocalize(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-500"
            />
            <span className="text-xs text-gray-300">跳过本地化（直接用英文草稿生成 DITA）</span>
          </label>
        </div>
      );

      return (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Fixed header */}
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">Stage 6b — 人工确认 & 选择本地化语言</h2>
            <div className="flex-1" />
            <button
              onClick={() => handleGoBack('post_edit_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ 返回编辑后审查
            </button>
          </div>

          {/* ReviewPanel: left = AI comments (accept/reject), right = editable draft */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={confirmDrafts}
              comments={state.postEditReviewComments}
              onSubmit={(editedContent, acceptedIds) =>
                submitHumanConfirm(true, selectedLang, editedContent, acceptedIds, skipLocalize)
              }
              title="Stage 6b — AI 审查建议（可接受/撤销）& 草稿编辑"
              submitLabel={
                skipLocalize
                  ? '⏭ 跳过本地化，直接生成 DITA ▶'
                  : `✅ 确认，本地化为 ${LANG_OPTIONS.find((o) => o.value === selectedLang)?.label.split('（')[0] ?? selectedLang} ▶`
              }
              footerLeft={langFooter}
            />
          </div>
        </div>
      );
    }

    // Human Localize Review (Stage 7b)
    if (status === 'PAUSED:HUMAN_LOCALIZE_REVIEW') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">Stage 7b — 人工本地化审核</h2>
            <div className="flex-1" />
            <button
              onClick={() => handleGoBack('localize_ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ 返回本地化审查
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* Original */}
            <div className="flex-1 border-r border-gray-700 overflow-y-auto p-4">
              <p className="text-xs text-gray-400 mb-2 font-semibold">📄 原文（只读）</p>
              <MarkdownRenderer content={state.drafts[0]?.content ?? ''} />
            </div>
            {/* Localized + Review */}
            <ReviewPanel
              drafts={state.localizedDrafts}
              comments={state.localizeReviewComments}
              onSubmit={(content, accepted) =>
                submitHumanLocalize(
                  state.localizedDrafts.map((d: import('../../../shared/types/document.types').DocumentDraft, i: number) => i === 0 ? { ...d, content } : d),
                  accepted
                )
              }
              title="本地化结果（可编辑）"
              submitLabel="确认完成，进入 DITA 生成 ▶"
            />
          </div>
        </div>
      );
    }

    // ─── Review: DITA (after dita_build, before dita_ai_review) ───
    if (status === 'PAUSED:REVIEW_DITA') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">📦 DITA XML 生成结果 — 请审阅后继续</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{state.ditaDocuments.length} 个 DITA 文档</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {state.ditaDocuments.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">暂无 DITA 文档</p>
            )}
            {state.ditaDocuments.map((d) => (
              <div key={d.id} className="p-3 bg-gray-800 rounded border border-gray-700">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
                  <span className="text-sm font-medium text-gray-200">📄 {d.title}.dita</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-900/40 text-orange-300 rounded">DITA XML</span>
                  <span className="text-[10px] text-gray-500 ml-auto">{d.content.length} 字符</span>
                </div>
                <pre className="p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto whitespace-pre border border-gray-700 max-h-96">{d.content}</pre>
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('dita_build')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ 返回重新生成
            </button>
            <button onClick={() => reviewContinue('review_dita')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ 确认，进入 DITA AI 审查
            </button>
          </div>
        </div>
      );
    }

    // Human DITA Review (Stage 8c)
    if (status === 'PAUSED:HUMAN_DITA_REVIEW') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">Stage 8c — 人工 DITA 审核</h2>
            <div className="flex-1" />
            <button
              onClick={() => handleGoBack('dita_ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ 返回 DITA AI 审查
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={state.ditaDocuments}
              comments={state.ditaReviewComments}
              onSubmit={(content, accepted) =>
                submitHumanDita(
                  state.ditaDocuments.map((d: import('../../../shared/types/document.types').DocumentDraft, i: number) => i === 0 ? { ...d, content } : d),
                  accepted
                )
              }
              title="DITA XML（可编辑）"
              submitLabel="确认完成，导出 DITA 文件 ▶"
            />
          </div>
        </div>
      );
    }

    // Completed
    if (status === 'COMPLETED') {
      return (
        <OutputPanel
          documents={state.outputDocuments}
          projectId={state.projectId}
          onNewProject={handleNewProject}
        />
      );
    }

    // Failed
    if (status === 'FAILED') {
      const prevStage = (() => {
        const stages: StageName[] = [
          'upload_parse', 'review_upload', 'ingest', 'analyze', 'review_analyze',
          'draft', 'review_draft', 'ai_review',
          'human_review', 'post_edit_review', 'human_confirm',
          'localize', 'review_localize', 'localize_ai_review', 'human_localize_review',
          'dita_build', 'review_dita', 'dita_ai_review', 'human_dita_review', 'export',
        ];
        const idx = stages.indexOf(currentStage);
        return idx > 0 ? stages[idx - 1] : null;
      })();

      return (
        <div className="p-6 space-y-4">
          <div className="p-4 bg-red-900/30 border border-red-700 rounded">
            <p className="text-red-400 font-medium">❌ 工作流失败</p>
            {state.error && <p className="text-red-300 text-sm mt-1">{state.error}</p>}
          </div>
          <div className="flex gap-3">
            {prevStage && (
              <button
                onClick={() => handleGoBack(prevStage)}
                className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-sm text-gray-200 rounded transition-colors"
              >
                ↩ 返回上一步重试
              </button>
            )}
            <button onClick={handleNewProject} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 rounded">
              重新开始
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6">
        <WorkflowProgress stage={currentStage} status={status} />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Main content area — flex-1 takes remaining space after LogViewer */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <StageNavigation
          currentStage={state.currentStage}
          status={state.status}
          onNewProject={handleNewProject}
          onGoBack={handleGoBack}
        />
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
      {/* Bottom collapsible log viewer — part of flex layout flow, won't overlap content */}
      <div className="shrink-0">
        <LogViewer logs={state.workflowLogs} />
      </div>
    </div>
  );
};
