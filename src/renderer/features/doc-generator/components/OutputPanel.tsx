import React, { useMemo, useState } from 'react';
import type { OutputDocument } from '../../../../shared/types/document.types';
import type {
  DownloadZipResult,
  ExportBundleResult,
  SplitPreviewResult,
} from '../../../../shared/types/ipc.types';
import type { GlossaryUsageReport } from '../../../../shared/types/glossary.types';
import type { DocGenState } from '../../../../shared/types/workflow.types';
import { useWorkflowStore } from '../../../stores/workflow.store';
import { SplitExportModal } from './SplitExportModal';
import { GlossaryUsageReportModal } from './GlossaryUsageReportModal';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface OutputPanelProps {
  documents: OutputDocument[];
  projectId: string;
  onNewProject: () => void;
}

const FORMAT_ICONS: Record<string, string> = {
  dita: '📄',
  docx: '📝',
  pdf: '📕',
};

export const OutputPanel: React.FC<OutputPanelProps> = ({ documents, projectId, onNewProject }) => {
  const [splitState, setSplitState] = useState<{ documentId: string; preview: SplitPreviewResult } | null>(null);
  const [usageReport, setUsageReport] = useState<GlossaryUsageReport | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [bundleExporting, setBundleExporting] = useState(false);
  const [bundleResult, setBundleResult] = useState<ExportBundleResult | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [zipResult, setZipResult] = useState<DownloadZipResult | null>(null);

  const ditaDocuments = useMemo(() => documents.filter((doc) => doc.format === 'dita'), [documents]);
  /**
   * Single-document projects get exactly one export action that writes the
   * complete file(s) **and** the per-section split files in one go, instead of
   * separate “split” / “export as…” buttons.
   */
  const singleDocument = ditaDocuments.length === 1;

  /** P4-4: terminology usage report for the exported documents. */
  const handleUsageReport = async () => {
    setUsageLoading(true);
    try {
      const state = useWorkflowStore.getState() as unknown as DocGenState;
      const text = (state.ditaDocuments ?? [])
        .map((doc) => doc.content)
        .join('\n\n');
      const report = await window.electronAPI.glossary.usageReport({
        text,
        hits: state.glossaryHits ?? [],
      });
      setUsageReport(report);
    } catch (err) {
      console.error('[Glossary][UI] usage report failed', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const handleSplitPreview = async (documentId: string) => {
    const preview = await window.electronAPI.file.splitPreview({ projectId, documentId });
    if (!preview) {
      window.alert(ui.docGenerator.splitNoSections);
      return;
    }
    setSplitState({ documentId, preview });
  };

  const handleShowInFolder = (filePath: string) => {
    window.electronAPI.file.showInFolder(filePath);
  };

  const handleSaveAs = async (filePath: string, fileName: string, format: string) => {
    const savedPath = await window.electronAPI.file.saveDita(filePath, fileName, format);
    if (savedPath) {
      // Optional: could show a toast/notification here
      console.info('File saved to:', savedPath);
    }
  };

  const handleExportAll = async () => {
    const destDir = await window.electronAPI.file.exportAll(projectId);
    if (destDir) {
      console.info('All files exported to:', destDir);
    }
  };

  /** One-click export: complete document + section-split files. */
  const handleBundleExport = async () => {
    const doc = ditaDocuments[0];
    if (!doc) return;
    setBundleExporting(true);
    setBundleError(null);
    try {
      const result = await window.electronAPI.file.exportBundle({
        projectId,
        documentId: doc.documentId ?? doc.id,
      });
      if (result) {
        setBundleResult(result);
        console.info('[File][UI] exportBundle done', result);
      }
    } catch (err) {
      setBundleError(String(err));
    } finally {
      setBundleExporting(false);
    }
  };

  const handleDownloadZip = async () => {
    setZipDownloading(true);
    setBundleError(null);
    try {
      const result = await window.electronAPI.file.downloadZip(projectId);
      if (result) {
        setZipResult(result);
        console.info('[File][UI] ZIP saved to', result.filePath);
      }
    } catch (err) {
      console.error('[File][UI] ZIP download failed', err);
      setBundleError(String(err));
    } finally {
      setZipDownloading(false);
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="text-2xl">✅</span>
        <h2 className="text-lg font-semibold text-green-400">{ui.docGenerator.generationComplete}</h2>
      </div>

      <div className="p-3 bg-gray-800 rounded border border-gray-700">
        <p className="text-xs text-gray-400">
          📋 {ui.docGenerator.exportedFormat} <span className="text-blue-400 font-medium">{ui.docGenerator.ditaConceptTopic}</span> + <span className="text-blue-400 font-medium">{ui.docGenerator.wordDocx}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {ui.docGenerator.exportedFormatDescription}
        </p>
      </div>

      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700"
          >
            <span className="text-xl">{FORMAT_ICONS[doc.format] ?? '📄'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{doc.title}</p>
              <p className="text-xs text-gray-500">
                {doc.fileName} · {(doc.size / 1024).toFixed(1)} KB · {doc.format.toUpperCase()}
              </p>
            </div>
            <div className="flex gap-2">
              {doc.format === 'dita' && doc.documentId && !singleDocument && (
                <button
                  onClick={() => void handleSplitPreview(doc.documentId as string)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                >
                  ✂️ {ui.docGenerator.splitExport}
                </button>
              )}
              {!singleDocument && (
                <button
                  onClick={() => handleSaveAs(doc.filePath, doc.fileName, doc.format)}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                >
                  💾 {ui.docGenerator.exportTo}
                </button>
              )}
              <button
                onClick={() => handleShowInFolder(doc.filePath)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                {ui.docGenerator.showInFolder}
              </button>
            </div>
          </div>
        ))}
      </div>

      {documents.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {singleDocument ? (
            <button
              onClick={() => void handleBundleExport()}
              disabled={bundleExporting}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded transition-colors font-medium"
            >
              📤 {bundleExporting ? ui.docGenerator.exportBundleRunning : ui.docGenerator.exportBundle}
            </button>
          ) : (
            <button
              onClick={handleExportAll}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors font-medium"
            >
              📁 {ui.docGenerator.exportAll}
            </button>
          )}
          {documents.length > 0 && (
            <button
              onClick={() => void handleDownloadZip()}
              disabled={zipDownloading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm text-gray-200 rounded transition-colors"
            >
              {ui.docGenerator.downloadZip}
            </button>
          )}
          <button
            onClick={() => void handleUsageReport()}
            disabled={usageLoading}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm text-gray-200 rounded transition-colors"
          >
            📊 {ui.docGenerator.glossaryUsageReport}
          </button>
        </div>
      )}

      {bundleError && (
        <p className="text-xs text-red-400">⚠ {bundleError}</p>
      )}

      {zipResult && (
        <div className="p-3 bg-gray-800 border border-gray-700 rounded space-y-1">
          <p className="text-[11px] text-green-300">
            {formatUi(ui.docGenerator.zipDone, {
              count: zipResult.entries,
              path: zipResult.filePath,
            })}
          </p>
          <p className="text-[11px] text-gray-400">
            {zipResult.sectionFiles > 0 && zipResult.sectionFolders.length > 0
              ? formatUi(ui.docGenerator.zipSections, {
                  count: zipResult.sectionFiles,
                  folders: zipResult.sectionFolders.join(', '),
                })
              : ui.docGenerator.zipNoSections}
          </p>
          <button
            onClick={() => void window.electronAPI.file.showInFolder(zipResult.filePath)}
            className="mt-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[11px] rounded"
          >
            📂 {ui.docGenerator.zipShowFile}
          </button>
        </div>
      )}

      {bundleResult && (
        <div className="p-3 bg-green-950/30 border border-green-800/50 rounded space-y-1">
          <p className="text-[11px] text-green-300">
            {bundleResult.splitDir
              ? formatUi(ui.docGenerator.exportBundleDone, {
                  count: bundleResult.splitFiles.length,
                  directory: bundleResult.destDir,
                })
              : ui.docGenerator.exportBundleNoSections}
          </p>
          {bundleResult.fullFiles.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold text-gray-400">{ui.docGenerator.exportBundleFull}</p>
              {bundleResult.fullFiles.map((file) => (
                <p key={`full:${file.fileName}`} className="text-[11px] text-gray-300 font-mono truncate">
                  📄 {file.fileName}
                </p>
              ))}
            </div>
          )}
          {bundleResult.splitFiles.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              <p className="text-[11px] font-semibold text-gray-400">
                {formatUi(ui.docGenerator.exportBundleSplit, { count: bundleResult.splitFiles.length })}
                {bundleResult.splitDir ? <span className="text-gray-500"> · {bundleResult.splitDir}</span> : null}
              </p>
              {bundleResult.splitFiles.map((file) => (
                <p
                  key={`split:${file.format}:${file.fileName}`}
                  className="text-[11px] text-gray-300 font-mono truncate"
                >
                  {file.valid ? '✅' : '⚠️'} {file.fileName}
                </p>
              ))}
            </div>
          )}
          <button
            onClick={() => void window.electronAPI.app.openPath(bundleResult.destDir)}
            className="mt-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[11px] rounded"
          >
            📂 {ui.docGenerator.splitOpenFolder}
          </button>
        </div>
      )}

      <div className="pt-4 border-t border-gray-700 flex gap-3">
        <button
          onClick={onNewProject}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          {ui.docGenerator.newProject}
        </button>
      </div>

      {splitState && (
        <SplitExportModal
          preview={splitState.preview}
          onClose={() => setSplitState(null)}
          onExport={(options) =>
            window.electronAPI.file.splitExport({
              projectId,
              documentId: splitState.documentId,
              options,
            })
          }
        />
      )}

      {usageReport && (
        <GlossaryUsageReportModal
          report={usageReport}
          onClose={() => setUsageReport(null)}
        />
      )}
    </div>
  );
};
