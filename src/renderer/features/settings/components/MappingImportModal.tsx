import React, { useEffect, useState } from 'react';
import type { MappingImportParseResult, MappingImportResult } from '../../../../shared/types/mapping.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface MappingImportModalProps {
  parseResult: MappingImportParseResult;
  onClose: () => void;
  onImport: () => Promise<MappingImportResult>;
}

/**
 * Import preview dialog for the three glossary columns.
 */
export const MappingImportModal: React.FC<MappingImportModalProps> = ({
  parseResult,
  onClose,
  onImport,
}) => {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<MappingImportResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, importing]);

  const previewRows = parseResult.rows.slice(0, 10);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await onImport();
      setResult(res);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={importing ? undefined : onClose}>
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-[760px] max-w-[92vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-100">📥 {ui.settings.importPreviewTitle}</h3>
          <span className="text-xs text-gray-500 truncate">{parseResult.fileName}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{parseResult.rows.length} {ui.common.rows}</span>
        </div>

        <div className="px-5 py-4 overflow-y-auto shrink-0">
          <p className="text-[10px] text-gray-500 mb-2">
            {ui.settings.columnOrder}
          </p>

          {/* Preview */}
          <div className="border border-gray-700 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-700/60 text-gray-300">
                  <th className="px-3 py-1.5 text-left font-medium w-1/3">{ui.settings.english}</th>
                  <th className="px-3 py-1.5 text-left font-medium w-1/3">{ui.settings.simplifiedChinese}</th>
                  <th className="px-3 py-1.5 text-left font-medium w-1/3">{ui.settings.traditionalChinese}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60">
                {previewRows.map((r, i) => (
                  <tr key={i} className="text-gray-300">
                    <td className="px-3 py-1.5 break-all">{r.en}</td>
                    <td className="px-3 py-1.5 break-all">{r.zhCN}</td>
                    <td className="px-3 py-1.5 break-all">{r.zhTW}</td>
                  </tr>
                ))}
                {parseResult.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                      {ui.settings.noValidRows}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {parseResult.rows.length > 10 && (
              <div className="px-3 py-1.5 text-[10px] text-gray-500 border-t border-gray-700/60">
                {formatUi(ui.settings.showingFirstRows, { count: parseResult.rows.length })}
              </div>
            )}
          </div>

          {/* Import result */}
          {result && (
            <div className="mt-3 text-xs space-y-1">
              <p className="text-green-400">✅ {formatUi(ui.settings.imported, { count: result.imported })}</p>
              {result.skipped > 0 && (
                <p className="text-amber-400">⚠️ {formatUi(ui.settings.skipped, { count: result.skipped })}</p>
              )}
              {result.errors.length > 0 && (
                <div className="max-h-24 overflow-y-auto text-gray-400 space-y-0.5">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <p key={i}>· {e}</p>
                  ))}
                  {result.errors.length > 20 && <p>… {formatUi(ui.settings.notices, { count: result.errors.length })}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-700 flex items-center gap-3 shrink-0">
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={importing}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded transition-colors"
          >
            {ui.common.close}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={importing || parseResult.rows.length === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              {importing ? ui.settings.importing : `✅ ${ui.settings.confirmImport}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
