import React, { useState, useRef, useEffect } from 'react';
import { useLocalization, STAGE_LABELS } from './hooks/useLocalization';
import { ReviewPanel } from '../doc-generator/components/ReviewPanel';
import { XmlHighlight } from '../doc-generator/components/xml/XmlHighlight';
import { StepNavigation, type StepNavItem } from '../../components/StepNavigation';
import { LocalizePreviewModal } from './components/LocalizePreviewModal';
import { SplitExportModal } from '../doc-generator/components/SplitExportModal';
import { useMappingStore } from '../../stores/mapping.store';
import type { LocalizeLanguage } from '../../../shared/types/document.types';
import type { LocalizationStage, LocalizationFileResult } from '../../../shared/types/localization.types';
import type { SplitPreviewResult } from '../../../shared/types/ipc.types';
import { en as ui, formatUi, languageLabel, pluralUnit } from '../../../shared/i18n';

const LANG_OPTIONS: { value: LocalizeLanguage; label: string }[] = [
  { value: 'en', label: ui.languages.en },
  { value: 'zh-CN', label: ui.languages['zh-CN'] },
  { value: 'zh-TW', label: ui.languages['zh-TW'] },
];

/** Workflow steps shown in the left vertical navigation (mirrors doc-generator). */
const LOCALIZE_STEPS: StepNavItem[] = [
  { id: 'localize', label: ui.localization.stageSteps.localize },
  { id: 'review_localize', label: ui.localization.stageSteps.review_localize, isPause: true },
  { id: 'localize_ai_review', label: ui.localization.stageSteps.localize_ai_review },
  { id: 'human_localize_review', label: ui.localization.stageSteps.human_localize_review, isPause: true },
  { id: 'post_edit_review', label: ui.localization.stageSteps.post_edit_review },
  { id: 'human_confirm', label: ui.localization.stageSteps.human_confirm, isPause: true },
  { id: 'export', label: ui.localization.stageSteps.export },
];

const RUNNING_MESSAGES: Record<LocalizationStage, string> = ui.localization.running;

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
    aiEditArtifact,
    goBack,
    exportTo,
    setTargetLanguage,
    reset,
  } = useLocalization();

  const running = status === 'running';
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewResult, setPreviewResult] = useState<LocalizationFileResult | null>(null);
  const [splitState, setSplitState] = useState<{ exportFileName: string; preview: SplitPreviewResult } | null>(null);

  const handleSplitPreview = async (exportFileName: string) => {
    const preview = await window.electronAPI.localization.splitPreview({ exportFileName });
    if (!preview) {
      window.alert(ui.docGenerator.splitNoSections);
      return;
    }
    setSplitState({ exportFileName, preview });
  };

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

  const langLabel = languageLabel(targetLanguage);

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
      <h2 className="text-sm font-semibold text-gray-200">🌐 {ui.localization.title}</h2>
      <span className="text-xs text-gray-500">{ui.localization.subtitle}</span>
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
                  📂 {ui.localization.selectFiles}
                </button>
                <span className="text-xs text-gray-400">
                  {files.length > 0 ? formatUi(ui.localization.selectedFiles, { count: files.length }) : ui.localization.multiSelectHint}
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
                <span className="text-xs font-medium text-gray-300 whitespace-nowrap">🌐 {ui.common.targetLanguage}</span>
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
                  ▶ {ui.localization.start}
                </button>
              </div>
            </section>

            {/* Translation mapping hint */}
            <section className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-base">🔁</span>
              <div className="text-xs text-gray-400 leading-relaxed">
                <span className="text-gray-300">{ui.localization.mappingLabel}</span>{' '}
                <span className={mappingCount > 0 ? 'text-blue-300 font-semibold' : 'text-gray-500'}>
                  {formatUi(ui.localization.mappingSummary, {
                    count: mappingCount,
                    unit: pluralUnit(mappingCount, ui.common.entry, ui.common.entries),
                    language: langLabel,
                  })}
                </span>{' '}
                <span className="text-gray-500">{ui.localization.mappingSettingsHint}</span>
              </div>
            </section>

            {/* Workflow explanation */}
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-2">📋 {ui.localization.workflowGuide}</h3>
              <ol className="list-decimal list-inside text-xs text-gray-400 space-y-1.5 leading-relaxed">
                <li>{ui.localization.steps.translate}</li>
                <li>{ui.localization.steps.humanReview}</li>
                <li>{ui.localization.steps.aiReview}</li>
                <li>{ui.localization.steps.humanLocalization}</li>
                <li>{ui.localization.steps.postEdit}</li>
                <li>{ui.localization.steps.confirmation}</li>
                <li>{ui.localization.steps.export}</li>
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
                {activeFile ? `⏳ ${STAGE_LABELS[stage]}: ${activeFile.split(/[\\/]/).pop()}` : STAGE_LABELS[stage]}
              </h3>
              {thinkingText && (
                <details open className="mb-2">
                  <summary className="text-xs text-amber-400/80 italic cursor-pointer select-none">{ui.localization.thinking}</summary>
                  <pre
                    ref={thinkingScrollRef}
                    className="mt-1 max-h-60 overflow-y-auto text-xs text-amber-300/70 italic whitespace-pre-wrap break-words font-mono"
                  >
                    {thinkingText}
                  </pre>
                </details>
              )}
              <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono">
                {contentText || ui.localization.waitingOutput}
              </pre>
            </section>

            {/* Logs */}
            {logs.length > 0 && (
              <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-200 mb-2">{ui.localization.progressLog}</h3>
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
            {ui.localization.processing}
          </div>
        </div>
      );
    }

    // ─── PAUSED:REVIEW_LOCALIZE — editable side-by-side review ───
    if (status === 'paused:review_localize') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">🌐 {ui.localization.localizationResultReview}</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{formatUi(ui.localization.resultCount, { count: results.length, language: langLabel })}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={localizedDrafts}
              comments={[]}
              leftPanel="original"
              originalDrafts={originalDrafts}
              onSubmit={(editedDrafts) => continueFromReviewLocalize(editedDrafts)}
              onAiEdit={aiEditArtifact}
              aiArtifactLabel={ui.localization.stageSteps.review_localize}
              title={ui.localization.localizedResultEditable}
              submitLabel={`▶ ${ui.localization.confirmAiReview}`}
              editorMode="xml"
              footerLeft={
                <button
                  onClick={() => goBack('localize')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
                >
                  ↩ {ui.localization.returnToTranslation}
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
            <h2 className="text-sm font-semibold text-gray-200">{ui.localization.humanReview}</h2>
            <div className="flex-1" />
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              {showOriginal ? ui.localization.hideOriginal : ui.localization.viewOriginal}
            </button>
            <button
              onClick={() => goBack('localize_ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ {ui.localization.backToAiReview}
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {showOriginal && (
              <div className="w-1/3 shrink-0 border-r border-gray-700 overflow-y-auto p-4">
                <p className="text-xs text-gray-400 mb-2 font-semibold">📄 {ui.review.sourceReadOnly}</p>
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
                onAiEdit={aiEditArtifact}
                aiArtifactLabel={ui.localization.stageSteps.human_localize_review}
                title={ui.localization.localizedResultEditable}
                submitLabel={`${ui.localization.submitChanges} ▶`}
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
            <h2 className="text-sm font-semibold text-gray-200">{ui.localization.finalReview}</h2>
            <div className="flex-1" />
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              {showOriginal ? ui.localization.hideOriginal : ui.localization.viewOriginal}
            </button>
            <button
              onClick={() => goBack('post_edit_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ {ui.localization.backToHumanReview}
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {showOriginal && (
              <div className="w-1/3 shrink-0 border-r border-gray-700 overflow-y-auto p-4">
                <p className="text-xs text-gray-400 mb-2 font-semibold">📄 {ui.review.sourceReadOnly}</p>
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
                onAiEdit={aiEditArtifact}
                aiArtifactLabel={ui.localization.stageSteps.human_confirm}
                title={ui.localization.finalResult}
                submitLabel={`✅ ${ui.localization.confirmExport} ▶`}
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
              <h3 className="text-sm font-semibold text-gray-200 mb-1">✅ {ui.localization.translationComplete}</h3>
              <p className="text-xs text-gray-500 mb-3">
                {formatUi(ui.localization.filenameFormat, { example: results[0]?.exportFileName ?? 'technical-document.zh-TW.dita' })}
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
                          {ui.localization.exportedAs} <span className="text-gray-300 font-mono">{r.exportFileName}</span>
                        </div>
                      )}
                      <div className="text-xs mt-0.5">
                        {r.status === 'done' ? (
                          r.validated ? (
                            r.repaired ? (
                              <span className="text-amber-400">⚠️ {ui.localization.xmlAutoRepaired}</span>
                            ) : (
                               <span className="text-green-400">✅ {ui.localization.xmlValid}</span>
                            )
                          ) : (
                            <span className="text-red-400">❌ {ui.localization.xmlInvalid}</span>
                          )
                        ) : (
                          <span className="text-red-400">{r.error ?? ui.localization.unknownError}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {formatUi(ui.localization.reviewSummary, { reviews: r.reviewComments.length, suggestions: r.postEditComments.length })}
                    </span>
                    {r.status === 'done' && (
                      <button
                        onClick={() => setPreviewResult(r)}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors shrink-0"
                      >
                        👁 {ui.localization.viewPreview}
                      </button>
                    )}
                    {r.status === 'done' && (
                      <button
                        onClick={() => void handleSplitPreview(r.exportFileName)}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors shrink-0"
                      >
                        ✂️ {ui.localization.splitExport}
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
                  📁 {ui.localization.chooseDirectoryAndExport}
                </button>
                {exportResult && (
                  <span className="text-xs text-green-400">
                    {formatUi(ui.localization.exportSuccess, { count: exportResult.count, directory: exportResult.destDir })}
                  </span>
                )}
              </div>
            </section>
          </div>
          {splitState && (
            <SplitExportModal
              preview={splitState.preview}
              onClose={() => setSplitState(null)}
              onExport={(options) =>
                window.electronAPI.localization.splitExport({
                  exportFileName: splitState.exportFileName,
                  options,
                })
              }
            />
          )}
        </div>
      );
    }

    // ─── FAILED ───
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="p-4 bg-red-900/30 border border-red-700 rounded">
            <p className="text-red-400 font-medium">❌ {ui.localization.failed}</p>
            <p className="text-red-300 text-sm mt-1">
              {ui.localization.failureDescription}
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
              ↩ {ui.localization.returnToTranslation}
            </button>
            <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 rounded">
              {ui.localization.reset}
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
          title={ui.common.workflowSteps}
          steps={LOCALIZE_STEPS}
          currentStep={stage}
          status={status}
          onGoBack={running ? undefined : handleGoBack}
          footer={
            <button
              onClick={reset}
              className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
            >
              ↺ {ui.localization.newTranslation}
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
