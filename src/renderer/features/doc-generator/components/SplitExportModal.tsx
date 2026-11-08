import React, { useMemo, useState } from 'react';
import type {
  IncludeIntroMode,
  SplitExportOptions,
  SplitExportResult,
  SplitPreviewResult,
} from '../../../../shared/types/ipc.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface SplitExportModalProps {
  preview: SplitPreviewResult;
  onExport: (options: SplitExportOptions) => Promise<SplitExportResult | null>;
  onClose: () => void;
}

/**
 * Section split export dialog (design §3.7 / S2-2 + S3-2).
 * Generic over the source (doc-generator DITA documents or localized DITA
 * results) — the caller provides the export callback.
 */
export const SplitExportModal: React.FC<SplitExportModalProps> = ({ preview, onExport, onClose }) => {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(preview.sections.map((section) => section.index))
  );
  const [formats, setFormats] = useState<{ dita: boolean; docx: boolean }>({ dita: true, docx: false });
  const [includeIntro, setIncludeIntro] = useState<IncludeIntroMode>('none');
  const [createMap, setCreateMap] = useState(false);
  const [titleFromSection, setTitleFromSection] = useState(false);
  const [includeFull, setIncludeFull] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<SplitExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === preview.sections.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(preview.sections.map((section) => section.index)));
  };
  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectedFormats = useMemo(() => {
    const list: ('dita' | 'docx')[] = [];
    if (formats.dita) list.push('dita');
    if (formats.docx) list.push('docx');
    return list;
  }, [formats]);

  const handleExport = async () => {
    if (selected.size === 0 || selectedFormats.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const exported = await onExport({
        selected: [...selected].sort((a, b) => a - b),
        formats: selectedFormats,
        includeIntro,
        createMap,
        titleFromSection,
        includeFull,
      });
      if (exported) setResult(exported);
    } catch (err) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-700 shrink-0 flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-200">✂️ {ui.docGenerator.splitExportTitle} · {preview.docTitle}</h3>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-sm">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAll}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded border border-gray-600"
            >
              {ui.docGenerator.splitSelectAll}
            </button>
            <span className="text-xs text-gray-500">
              {formatUi(ui.docGenerator.splitSectionCount, { count: preview.sections.length })}
            </span>
          </div>

          {preview.sections.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-6">{ui.docGenerator.splitNoSections}</p>
          )}

          <div className="space-y-1">
            {preview.sections.map((section) => (
              <label
                key={section.index}
                className="flex items-center gap-2 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(section.index)}
                  onChange={() => toggle(section.index)}
                />
                <span className="flex-1 text-gray-200 truncate font-mono">{section.fileName}</span>
                <span className="text-gray-500 truncate max-w-[40%] shrink-0" title={section.title}>
                  {section.title}
                </span>
                <span className="text-gray-500 shrink-0">{(section.chars / 1024).toFixed(1)} KB</span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-gray-300">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={formats.dita} onChange={(e) => setFormats((p) => ({ ...p, dita: e.target.checked }))} />
              {ui.docGenerator.splitFormatDita}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={formats.docx} onChange={(e) => setFormats((p) => ({ ...p, docx: e.target.checked }))} />
              {ui.docGenerator.splitFormatDocx}
            </label>
            <label className="flex items-center gap-1.5">
              {ui.docGenerator.splitIncludeIntro}
              <select
                value={includeIntro}
                onChange={(e) => setIncludeIntro(e.target.value as IncludeIntroMode)}
                className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs"
              >
                <option value="none">{ui.docGenerator.splitIntroNone}</option>
                <option value="first">{ui.docGenerator.splitIntroFirst}</option>
                <option value="all">{ui.docGenerator.splitIntroAll}</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-gray-300">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={includeFull} onChange={(e) => setIncludeFull(e.target.checked)} />
              {ui.docGenerator.splitIncludeFull}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={createMap} onChange={(e) => setCreateMap(e.target.checked)} />
              {ui.docGenerator.splitCreateMap}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={titleFromSection} onChange={(e) => setTitleFromSection(e.target.checked)} />
              {ui.docGenerator.splitTitleFromSection}
            </label>
            <p className="text-[11px] text-gray-500">{ui.docGenerator.splitIndexNote}</p>
          </div>

          {preview.warnings.length > 0 && (
            <div className="p-2 bg-amber-950/30 border border-amber-800/50 rounded">
              <div className="text-[11px] font-semibold text-amber-300 mb-1">{ui.docGenerator.splitWarnings}</div>
              {preview.warnings.map((warning, index) => (
                <p key={index} className="text-[11px] text-amber-200/80">⚠ {warning}</p>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {result && (
            <div className="p-2 bg-green-950/30 border border-green-800/50 rounded space-y-1">
              <div className="text-[11px] text-green-300">
                {formatUi(ui.docGenerator.splitExportDone, { count: result.files.length, directory: result.destDir })}
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {(result.fullFiles ?? []).map((file) => (
                  <div key={`full:${file.fileName}`} className="text-[11px] text-gray-300 font-mono truncate">
                    📄 {file.fileName}
                  </div>
                ))}
                {result.files.map((file) => (
                  <div key={`${file.format}:${file.fileName}`} className="text-[11px] text-gray-300 font-mono truncate">
                    {file.valid ? '✅' : '⚠️'} {file.fileName}
                  </div>
                ))}
              </div>
              <button
                onClick={() => void window.electronAPI.app.openPath(result.destDir)}
                className="mt-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[11px] rounded"
              >
                📂 {ui.docGenerator.splitOpenFolder}
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-700 shrink-0 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded">
            {ui.common.cancel}
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={exporting || selected.size === 0 || selectedFormats.length === 0}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded"
          >
            {exporting ? '…' : ui.docGenerator.splitChooseDir}
          </button>
        </div>
      </div>
    </div>
  );
};
