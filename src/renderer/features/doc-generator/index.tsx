import React, { useState, useRef, useEffect } from 'react';
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
import { GlossaryHitsPanel } from './components/GlossaryHitsPanel';
import { GlossaryAppliedNotice } from './components/GlossaryAppliedNotice';
import { XmlHighlight } from './components/xml/XmlHighlight';
import { AiArtifactChat } from './components/AiArtifactChat';
import { AiDraftEditor } from './components/AiDraftEditor';
import type { UploadedFile, DocumentOutline } from '../../../shared/types/document.types';
import type { StageName } from '../../../shared/types/workflow.types';
import { en as ui, formatUi, languageLabel } from '../../../shared/i18n';
import { buildMarkdownArtifactBundle, extractMarkdownArtifact, fileExtractionToMarkdown } from '../../../shared/utils/artifact-markdown';

function parsedFilesMarkdown(files: UploadedFile[]): string {
  return buildMarkdownArtifactBundle(
    files.map((file) => ({
      id: file.id,
      title: file.name,
      markdown: file.parseMarkdown || file.parseExtraction?.markdown || fileExtractionToMarkdown(file.parseExtraction, file),
    })),
    'Reviewed file extraction bundle',
  );
}

export const DocGeneratorTab: React.FC = () => {
  const { state, startWorkflow, goBack, pause, resume, submitHumanReview, submitHumanDita, reviewContinue, aiEditArtifact } = useWorkflow();
  const [isStarting, setIsStarting] = useState(false);
  const [localFiles, setLocalFiles] = useState<UploadedFile[]>([]);
  // Local checkpoint edits remain visible while the user iterates in the chat;
  // they are sent back through reviewContinue when the checkpoint is submitted.
  const [reviewInputFiles, setReviewInputFiles] = useState<UploadedFile[] | null>(null);
  const [reviewAnalysisResults, setReviewAnalysisResults] = useState<typeof state.analysisResults | null>(null);
  const [reviewAnalysisSynthesis, setReviewAnalysisSynthesis] = useState<string | null>(null);
  const [reviewReferences, setReviewReferences] = useState<typeof state.referenceSearchResults | null>(null);
  const [reviewGlossaryHits, setReviewGlossaryHits] = useState<typeof state.glossaryHits | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<typeof state.drafts | null>(null);

  useEffect(() => {
    if (state.status === 'PAUSED:REVIEW_UPLOAD') setReviewInputFiles(state.inputFiles);
    if (state.status === 'PAUSED:REVIEW_ANALYZE') {
      setReviewAnalysisResults(state.analysisResults);
      setReviewAnalysisSynthesis(state.analysisSynthesisMarkdown);
      setReviewReferences(state.referenceSearchResults);
      setReviewGlossaryHits(state.glossaryHits ?? []);
    }
    if (state.status === 'PAUSED:REVIEW_DRAFT') setReviewDrafts(state.drafts);
  }, [
    state.status,
    state.currentStage,
    state.inputFiles,
    state.analysisResults,
    state.analysisSynthesisMarkdown,
    state.referenceSearchResults,
    state.glossaryHits,
    state.drafts,
  ]);

  // Auto-scroll the running content area so the latest AI stream output stays visible.
  // Auto-scroll pauses when the user scrolls up, and resumes when they return to the bottom.
  const runningScrollRef = useRef<HTMLDivElement>(null);
  const [runningAutoScroll, setRunningAutoScroll] = useState(true);
  useEffect(() => {
    if (state.status === 'RUNNING' && runningAutoScroll && runningScrollRef.current) {
      runningScrollRef.current.scrollTop = runningScrollRef.current.scrollHeight;
    }
  }, [state.streamChunks, state.status, runningAutoScroll]);

  const handleRunningScroll = () => {
    const el = runningScrollRef.current;
    if (!el) return;
    setRunningAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const handleFilesAdded = (newFiles: UploadedFile[]) => {
    setLocalFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.path))];
    });
  };

  const handleRemoveFile = (id: string) => {
    setLocalFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUpdateFileInstruction = (id: string, instruction: string) => {
    setLocalFiles((prev) => prev.map((f) => (f.id === id ? { ...f, parseInstruction: instruction } : f)));
  };

  const handleStartWorkflow = async (
    filePaths: string[],
    outline?: DocumentOutline,
    parseInstruction?: string,
    fileInstructions?: Record<string, string>,
    useGlossary?: boolean
  ) => {
    console.info('[WF][UI] Start button clicked', { fileCount: filePaths.length, filePaths, useGlossary });
    setIsStarting(true);
    try {
      await startWorkflow(filePaths, outline, parseInstruction, fileInstructions, useGlossary);
      console.info('[WF][UI] Workflow start request completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WF][UI] Workflow start failed', err);
      state.setState({
        status: 'FAILED',
        error: formatUi(ui.docGenerator.startWorkflowFailed, { message }),
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleNewProject = () => {
    setLocalFiles([]);
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
          onUpdateFileInstruction={handleUpdateFileInstruction}
          onStartWorkflow={handleStartWorkflow}
          isStarting={isStarting}
        />
      );
    }

    // Running stages (non-interactive) — show detailed progress
    if (status === 'RUNNING') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Fixed header: stage progress + controls */}
          <div className="shrink-0 px-6 pt-4 pb-2 flex items-center gap-3">
            <WorkflowProgress
              stage={currentStage}
              status={status}
              message={formatUi(
                ui.workflow.progress[currentStage as keyof typeof ui.workflow.progress] ?? ui.workflow.progress.default,
                { language: languageLabel(state.targetLanguage) },
              )}
            />
            {/* Back button — allow going back to previous stage */}
            {currentStage !== 'upload_parse' && (
              <button
                onClick={() => {
                  const stages: StageName[] = [
                    'upload_parse', 'review_upload', 'ingest', 'analyze', 'review_analyze',
                    'draft', 'review_draft', 'ai_review',
                    'human_review',
                    'dita_build', 'review_dita', 'dita_ai_review', 'human_dita_review', 'export',
                  ];
                  const idx = stages.indexOf(currentStage);
                  if (idx > 0) handleGoBack(stages[idx - 1]);
                }}
                className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
              >
                ↩ {ui.common.backToPreviousStep}
              </button>
            )}
            {/* Pause button — cancels the in-flight AI call (M3) */}
            <button
              onClick={() => pause()}
              className="shrink-0 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-gray-100 text-xs rounded transition-colors"
              title={ui.docGenerator.pauseAiCallTitle}
            >
              ⏸ {ui.docGenerator.pauseAiCall}
            </button>
          </div>

          {/* Single scrollable content area — one scrollbar for all live output */}
          <div
            ref={runningScrollRef}
            onScroll={handleRunningScroll}
            className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4"
          >
            {/* Live progress detail (e.g. current file being processed) */}
            {state.currentProgressMessage && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/70 rounded border border-gray-700 text-xs text-blue-300">
                <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span>{state.currentProgressMessage}</span>
              </div>
            )}

            {/* 📚 Make glossary usage visible while the draft / DITA is generated */}
            {(currentStage === 'draft' ||
              currentStage === 'ai_review' ||
              currentStage === 'dita_build' ||
              currentStage === 'dita_ai_review') && (
              <GlossaryAppliedNotice
                hits={state.glossaryHits ?? []}
                enabled={state.useGlossary !== false}
              />
            )}

            {/* File list during upload_parse stage */}
            {currentStage === 'upload_parse' && state.inputFiles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">📂 {ui.docGenerator.pendingFiles}</p>
                {state.inputFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded text-xs">
                    <span className="text-gray-300 truncate flex-1">📄 {f.name}</span>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                      f.parseStatus === 'done' ? 'bg-green-900/40 text-green-300' :
                      f.parseStatus === 'error' ? 'bg-red-900/40 text-red-300' :
                      f.parseStatus === 'parsing' ? 'bg-blue-900/40 text-blue-300 animate-pulse' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {f.parseStatus === 'done' ? `✓ ${ui.docGenerator.fileComplete}` :
                       f.parseStatus === 'error' ? `✗ ${ui.docGenerator.fileFailed}` :
                       f.parseStatus === 'parsing' ? `⟳ ${ui.docGenerator.fileParsing}` : ui.docGenerator.fileWaiting}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* AI Streaming Output */}
            <AIStreamViewer
              chunks={state.streamChunks}
              currentStage={currentStage}
              isRunning={status === 'RUNNING'}
            />

            {/* Show live draft preview during draft/review stages */}
            {(currentStage === 'draft' || currentStage === 'ai_review') && state.drafts.length > 0 && (
              <CollapsibleSection
                key={`draft-preview-${currentStage}`}
                title={`📝 ${ui.docGenerator.draftPreview}`}
                defaultExpanded={true}
              >
                <DraftViewer drafts={state.drafts} />
              </CollapsibleSection>
            )}
            {/* Show live DITA XML preview during dita_build / dita_ai_review stages */}
            {(currentStage === 'dita_build' || currentStage === 'dita_ai_review') && state.ditaDocuments.length > 0 && (
              <CollapsibleSection
                key={`dita-preview-${currentStage}`}
                title={`📦 ${ui.docGenerator.ditaPreview}`}
                defaultExpanded={true}
              >
                {state.ditaDocuments.map((d) => (
                  <div key={d.id} className="mb-3">
                    <p className="text-xs text-gray-400 mb-1 font-medium">📄 {d.title}.dita</p>
                    <XmlHighlight code={d.content} />
                  </div>
                ))}
              </CollapsibleSection>
            )}
            {/* Show analysis summary during analyze, draft, and review stages */}
            {(currentStage === 'analyze' || currentStage === 'draft' || currentStage === 'ai_review') && state.analysisResults.length > 0 && (
              <CollapsibleSection
                key={`analysis-${currentStage}`}
                title={`🔍 ${ui.docGenerator.analysisResults}`}
                defaultExpanded={false}
              >
                <div className="space-y-2">
                  {state.analysisSynthesisMarkdown && (
                    <div className="p-3 bg-indigo-950/30 rounded border border-indigo-700/50">
                      <div className="text-xs font-semibold text-indigo-300 mb-1">🧩 Cross-file synthesis</div>
                      <MarkdownRenderer content={state.analysisSynthesisMarkdown} />
                    </div>
                  )}
                  {state.analysisResults.map((r) => (
                    <div key={r.fileId} className="p-3 bg-gray-800 rounded border border-gray-700">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-200">📄 {r.fileName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded">{ui.stream.analysisResult}</span>
                      </div>
                      <MarkdownRenderer content={r.markdown || r.summary} />
                      {r.keyPoints && r.keyPoints.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] font-medium text-gray-500 uppercase">{ui.workflow.review.keyPoints}</span>
                          <ul className="list-disc list-inside text-xs text-gray-300 mt-0.5 space-y-0.5">
                            {r.keyPoints.map((kp, i) => (
                              <li key={i}>{kp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {r.technicalTerms && r.technicalTerms.length > 0 && (
                        <div className="mt-2">
                           <span className="text-[10px] font-medium text-gray-500 uppercase">{ui.workflow.review.technicalTerms}</span>
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
          </div>

          {/* Fixed footer hint — always visible, no empty gap below */}
          <div className="shrink-0 px-6 py-2 border-t border-gray-700/60 bg-gray-900/70 flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            {ui.workflow.running.processingHint}
          </div>
        </div>
      );
    }

    // ─── User-paused (M3): in-flight workflow paused by the user ───
    if (status === 'PAUSED:USER') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">⏸ {ui.workflow.running.pausedTitle}</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{formatUi(ui.docGenerator.pausedStage, { stage: ui.workflow.stages[currentStage] })}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded">
              <p className="text-sm text-yellow-300">{ui.workflow.running.pausedDescription}</p>
              <p className="text-xs text-gray-400 mt-1">
                {ui.workflow.running.pausedHint}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => resume()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
              >
                ▶ {ui.workflow.running.resume}
              </button>
              {currentStage !== 'upload_parse' && (
                <button
                  onClick={() => {
                    const stages: StageName[] = [
                      'upload_parse', 'review_upload', 'ingest', 'analyze', 'review_analyze',
                      'draft', 'review_draft', 'ai_review',
                      'human_review',
                      'dita_build', 'review_dita', 'dita_ai_review', 'human_dita_review', 'export',
                    ];
                    const idx = stages.indexOf(currentStage);
                    if (idx > 0) handleGoBack(stages[idx - 1]);
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
                >
                  ↩ {ui.common.backToPreviousStep}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ─── Review: Upload & Parse (after upload_parse, before ingest) ───
    if (status === 'PAUSED:REVIEW_UPLOAD') {
      const doneFiles = state.inputFiles.filter((f) => f.parseStatus === 'done');
      const errorFiles = state.inputFiles.filter((f) => f.parseStatus === 'error');
      const pendingFiles = state.inputFiles.filter((f) => f.parseStatus === 'pending' || f.parseStatus === 'parsing');
      const editableFiles = reviewInputFiles ?? state.inputFiles;
      const parsedFilesArtifact = parsedFilesMarkdown(editableFiles);
      const applyParsedFilesArtifact = (content: string) => {
        const nextFiles = editableFiles.map((original) => {
          const markdown = extractMarkdownArtifact(content, original.id);
          if (!markdown) throw new Error(`AI response must preserve the Markdown artifact for ${original.name}.`);
          return {
            ...original,
            // File identity, path, status and raw source remain application
            // controlled. Human/AI review edits the Markdown extraction only.
            parseMarkdown: markdown,
          };
        });
        setReviewInputFiles(nextFiles);
      };
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">📂 {ui.workflow.review.confirmParsedTitle}</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">✅ {formatUi(ui.workflow.review.readyCount, { count: doneFiles.length })}</span>
            {errorFiles.length > 0 && <span className="text-xs text-red-400">❌ {formatUi(ui.workflow.review.errorCount, { count: errorFiles.length })}</span>}
            {pendingFiles.length > 0 && <span className="text-xs text-yellow-400">⏳ {formatUi(ui.workflow.review.pendingCount, { count: pendingFiles.length })}</span>}
          </div>
          <div className="px-4 py-1.5 bg-blue-900/20 border-b border-blue-800/50 shrink-0">
            <p className="text-xs text-blue-300">
              💡 {formatUi(ui.workflow.review.combinedFilesHint, { count: state.inputFiles.length })}
            </p>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {editableFiles.map((f) => (
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
                    {f.parseStatus === 'done' ? ui.common.completed : f.parseStatus === 'error' ? ui.common.failed : ui.common.inProgress}
                  </span>
                </div>
                {f.parseSummary && <p className="text-xs text-gray-400 mt-1">📝 {f.parseSummary}</p>}
                {f.parseExtraction && f.parseExtraction.items.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                      🔎 Extracted information ({f.parseExtraction.items.length})
                    </summary>
                    <ul className="mt-1 space-y-1 rounded bg-gray-900 p-2 text-xs text-gray-400">
                      {f.parseExtraction.items.slice(0, 20).map((item, index) => (
                        <li key={`${item.title}-${index}`}>
                          <span className="text-gray-300">[{item.importance}] {item.title}:</span> {item.content}
                          {item.sourceLocation && <span className="text-gray-600"> · {item.sourceLocation}</span>}
                        </li>
                      ))}
                      {f.parseExtraction.items.length > 20 && <li className="text-gray-600">…more extracted items</li>}
                    </ul>
                  </details>
                )}
                {f.parseExtraction && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                      ▤ Full extraction Markdown (reviewable)
                    </summary>
                    <div className="mt-2 max-h-[60vh] min-h-0 overflow-auto rounded bg-gray-950 border border-gray-700">
                      <pre className="p-3 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-300 font-mono">
                        {f.parseMarkdown || f.parseExtraction.markdown || fileExtractionToMarkdown(f.parseExtraction, f)}
                      </pre>
                    </div>
                  </details>
                )}
                {f.parseError && <p className="text-xs text-red-400 mt-1">⚠ {f.parseError}</p>}
                {f.extractedText && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">{formatUi(ui.docGenerator.showExtractedText, { count: f.extractedText.length })}</summary>
                    <pre className="mt-1 p-2 bg-gray-900 rounded text-xs text-gray-400 max-h-48 overflow-y-auto whitespace-pre-wrap">{f.extractedText.slice(0, 2000)}{f.extractedText.length > 2000 ? `\n${ui.docGenerator.truncated}` : ''}</pre>
                  </details>
                )}
              </div>
            ))}
            </div>
            <AiArtifactChat
              currentContent={parsedFilesArtifact}
              artifactLabel={ui.workflow.stages.review_upload}
              onAiEdit={(content, instruction) => aiEditArtifact(content, instruction, 'markdown', 'review_upload')}
              onApply={applyParsedFilesArtifact}
            />
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('upload_parse')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ {ui.workflow.review.backToParse}
            </button>
            <button onClick={() => reviewContinue('review_upload', { editedInputFiles: editableFiles })} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ {ui.workflow.review.confirmAssemble}
            </button>
          </div>
        </div>
      );
    }

    // ─── Review: Analyze (after analyze, before draft) ───
    if (status === 'PAUSED:REVIEW_ANALYZE') {
      const editableAnalysis = reviewAnalysisResults ?? state.analysisResults;
      const editableSynthesis = reviewAnalysisSynthesis ?? state.analysisSynthesisMarkdown;
      const editableReferences = reviewReferences ?? state.referenceSearchResults;
      const editableGlossaryHits = reviewGlossaryHits ?? state.glossaryHits ?? [];
      const analysisArtifact = `${buildMarkdownArtifactBundle([
        ...editableAnalysis.map((result) => ({
          id: result.fileId,
          title: result.fileName,
          markdown: result.markdown || `# Content analysis: ${result.fileName}\n\n${result.summary}`,
        })),
        { id: '__cross_file_synthesis__', title: 'Cross-file synthesis', markdown: editableSynthesis || 'No cross-file synthesis was produced.' },
      ], 'Reviewed content analysis bundle')}\n\n## Reference search results\n\n${editableReferences.length > 0
        ? editableReferences.map((ref) => `- **${ref.fileName}** (${ref.relevanceScore}%): ${ref.snippet}`).join('\n')
        : 'None recorded.'}`;
      const applyAnalysisArtifact = (content: string) => {
        const nextAnalysis = editableAnalysis.map((original) => {
          const markdown = extractMarkdownArtifact(content, original.fileId);
          if (!markdown) throw new Error(`AI response must preserve the Markdown analysis for ${original.fileName}.`);
          return { ...original, markdown };
        });
        setReviewAnalysisResults(nextAnalysis);
        const synthesis = extractMarkdownArtifact(content, '__cross_file_synthesis__');
        if (!synthesis) throw new Error('AI response must preserve the cross-file synthesis Markdown.');
        setReviewAnalysisSynthesis(synthesis);
      };
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">🔍 {ui.workflow.review.analysisTitle}</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{formatUi(ui.workflow.review.analyzedCount, { count: state.analysisResults.length })}</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {editableAnalysis.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">{ui.workflow.review.noAnalysis}</p>
            )}
            <div className="p-4 bg-indigo-950/30 rounded border border-indigo-700/50">
              <div className="text-xs font-semibold text-indigo-300 mb-2">🧩 Cross-file synthesis</div>
              <MarkdownRenderer content={editableSynthesis || 'No cross-file synthesis was produced.'} />
            </div>
            {(state.useGlossary !== false || editableGlossaryHits.length > 0) && (
              <GlossaryHitsPanel hits={editableGlossaryHits} onChange={setReviewGlossaryHits} />
            )}
            {editableAnalysis.map((r) => (
              <div key={r.fileId} className="p-4 bg-gray-800 rounded border border-gray-700">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
                  <span className="text-sm font-medium text-gray-200">📄 {r.fileName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded">{ui.workflow.review.analysis}</span>
                </div>
                <MarkdownRenderer content={r.markdown || r.summary} />
                {r.keyPoints && r.keyPoints.length > 0 && (
                  <div className="mb-3">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{ui.workflow.review.keyPoints}</span>
                    <ul className="list-disc list-inside text-xs text-gray-300 mt-1 space-y-0.5">
                      {r.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}
                    </ul>
                  </div>
                )}
                {r.technicalTerms && r.technicalTerms.length > 0 && (
                  <div className="mb-3">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{ui.workflow.review.technicalTerms}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.technicalTerms.map((term) => (
                        <span key={term} className="px-1.5 py-0.5 bg-green-900/40 text-green-300 text-[10px] rounded border border-green-800/50">{term}</span>
                      ))}
                    </div>
                  </div>
                )}
                {r.keywords.length > 0 && (
                  <div>
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{ui.workflow.review.keywords}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.keywords.map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 text-[10px] rounded">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {editableReferences.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 mb-2">📚 {ui.workflow.review.references} ({editableReferences.length})</p>
                <div className="space-y-2">
                  {editableReferences.map((ref, i) => (
                    <div key={i} className="p-2.5 bg-gray-800/50 rounded border border-gray-700">
                      <p className="text-xs font-medium text-gray-300">{ref.fileName}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{ref.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
            <AiArtifactChat
              currentContent={analysisArtifact}
              artifactLabel={ui.workflow.stages.review_analyze}
              onAiEdit={(content, instruction) => aiEditArtifact(content, instruction, 'markdown', 'review_analyze')}
              onApply={applyAnalysisArtifact}
            />
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('analyze')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ {ui.workflow.review.backToAnalyze}
            </button>
            <button onClick={() => reviewContinue('review_analyze', {
              editedAnalysisResults: editableAnalysis,
              editedAnalysisSynthesisMarkdown: editableSynthesis,
              editedReferenceSearchResults: editableReferences,
              editedGlossaryHits: editableGlossaryHits,
            })} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ {ui.workflow.review.generateDraft}
            </button>
          </div>
        </div>
      );
    }

    // ─── Review: Draft (after draft, before ai_review) ───
    if (status === 'PAUSED:REVIEW_DRAFT') {
      const editableDrafts = reviewDrafts ?? state.drafts;
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">✍️ {ui.workflow.review.draftTitle}</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{formatUi(ui.workflow.review.draftCount, { count: state.drafts.length })}</span>
          </div>
          <div className="shrink-0 px-4 py-2 border-b border-gray-700 bg-gray-900/60">
            <GlossaryAppliedNotice hits={state.glossaryHits ?? []} enabled={state.useGlossary !== false} />
          </div>
          <div className="flex-1 overflow-hidden">
            <AiDraftEditor
              drafts={editableDrafts}
              onDraftsChange={setReviewDrafts}
              onAiEdit={(content, instruction) => aiEditArtifact(content, instruction, 'markdown', 'review_draft')}
            />
          </div>
          <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 flex items-center gap-3">
            <button onClick={() => handleGoBack('draft')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
              ↩ {ui.workflow.review.regenerate}
            </button>
            <button onClick={() => reviewContinue('review_draft', { editedDrafts: editableDrafts })} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors">
              ▶ {ui.workflow.review.beginQualityReview}
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
            <h2 className="text-sm font-semibold text-gray-200">{ui.workflow.review.humanReviewTitle}</h2>
            <div className="flex-1" />
            <button
              onClick={() => handleGoBack('ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ {ui.workflow.review.backToAiReview}
            </button>
          </div>
          <div className="shrink-0 px-4 py-2 border-b border-gray-700 bg-gray-900/60">
            <GlossaryAppliedNotice hits={state.glossaryHits ?? []} enabled={state.useGlossary !== false} />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={state.drafts}
              comments={state.aiReviewComments}
              onSubmit={submitHumanReview}
              onAiEdit={(content, instruction) => aiEditArtifact(content, instruction, 'markdown', 'human_review')}
              aiArtifactLabel={ui.workflow.stages.human_review}
              title={ui.workflow.review.humanReviewTitle}
              submitLabel={`${ui.workflow.review.submitEdits} ▶`}
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
            <h2 className="text-sm font-semibold text-gray-200">📦 {ui.workflow.review.ditaTitle}</h2>
            <div className="flex-1" />
            <span className="text-xs text-gray-400">{formatUi(ui.workflow.review.ditaCount, { count: state.ditaDocuments.length })}</span>
          </div>
          <div className="shrink-0 px-4 py-2 border-b border-gray-700 bg-gray-900/60">
            <GlossaryAppliedNotice hits={state.glossaryHits ?? []} enabled={state.useGlossary !== false} />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={state.ditaDocuments}
              comments={[]}
              onSubmit={(editedDitaDocuments) => reviewContinue('review_dita', { editedDitaDocuments })}
              onAiEdit={(content, instruction) => aiEditArtifact(content, instruction, 'xml', 'review_dita')}
              aiArtifactLabel={ui.workflow.stages.review_dita}
              title={ui.workflow.review.ditaTitle}
              submitLabel={`▶ ${ui.workflow.review.beginDitaReview}`}
              editorMode="xml"
              footerLeft={
                <button onClick={() => handleGoBack('dita_build')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors">
                  ↩ {ui.workflow.review.regenerate}
                </button>
              }
            />
          </div>
        </div>
      );
    }

    // Human DITA Review (Stage 8c)
    if (status === 'PAUSED:HUMAN_DITA_REVIEW') {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-200">{ui.workflow.review.humanDitaTitle}</h2>
            <div className="flex-1" />
            <button
              onClick={() => handleGoBack('dita_ai_review')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
            >
              ↩ {ui.workflow.review.backToDitaReview}
            </button>
          </div>
          <div className="shrink-0 px-4 py-2 border-b border-gray-700 bg-gray-900/60">
            <GlossaryAppliedNotice hits={state.glossaryHits ?? []} enabled={state.useGlossary !== false} />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewPanel
              drafts={state.ditaDocuments}
              comments={state.ditaReviewComments}
              onSubmit={(editedDrafts, accepted) =>
                submitHumanDita(editedDrafts, accepted)
              }
              onAiEdit={(content, instruction) => aiEditArtifact(content, instruction, 'xml', 'human_dita_review')}
              aiArtifactLabel={ui.workflow.stages.human_dita_review}
              title={ui.workflow.review.ditaEditable}
              submitLabel={`${ui.workflow.review.exportDita} ▶`}
              editorMode="xml"
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
          'human_review',
          'dita_build', 'review_dita', 'dita_ai_review', 'human_dita_review', 'export',
        ];
        const idx = stages.indexOf(currentStage);
        return idx > 0 ? stages[idx - 1] : null;
      })();

      return (
        <div className="p-6 space-y-4">
          <div className="p-4 bg-red-900/30 border border-red-700 rounded">
            <p className="text-red-400 font-medium">❌ {ui.workflow.review.workflowFailed}</p>
            {state.error && <p className="text-red-300 text-sm mt-1">{state.error}</p>}
          </div>
          <div className="flex gap-3">
            {prevStage && (
              <button
                onClick={() => handleGoBack(prevStage)}
                className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-sm text-gray-200 rounded transition-colors"
              >
                ↩ {ui.workflow.review.retryPrevious}
              </button>
            )}
            <button onClick={handleNewProject} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 rounded">
              {ui.workflow.review.restart}
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
