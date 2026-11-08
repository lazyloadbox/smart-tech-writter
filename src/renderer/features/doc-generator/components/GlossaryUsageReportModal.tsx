import React from 'react';
import type { GlossaryUsageReport } from '../../../../shared/types/glossary.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface GlossaryUsageReportModalProps {
  report: GlossaryUsageReport;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  used: 'text-green-400 border-green-700/60',
  variant: 'text-amber-300 border-amber-700/60',
  missing: 'text-red-400 border-red-700/60',
};

function statusLabel(status: string): string {
  if (status === 'used') return ui.docGenerator.glossaryUsageStatusUsed;
  if (status === 'variant') return ui.docGenerator.glossaryUsageStatusVariant;
  return ui.docGenerator.glossaryUsageStatusMissing;
}

/**
 * P4-4: pre-export terminology usage report.
 * Read-only summary of which approved terms the final document actually uses.
 */
export const GlossaryUsageReportModal: React.FC<GlossaryUsageReportModalProps> = ({
  report,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">📊 {ui.docGenerator.glossaryUsageTitle}</h3>
            <p className="text-[11px] text-gray-500 mt-1">{ui.docGenerator.glossaryUsageHint}</p>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-700 text-xs text-gray-300">
          {formatUi(ui.docGenerator.glossaryUsageSummary, {
            total: report.total,
            used: report.used,
            variantOnly: report.variantOnly,
            missing: report.missing,
            forbidden: report.forbidden,
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {report.rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-500">
              {ui.docGenerator.glossaryUsageEmpty}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-800 text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">en-US</th>
                  <th className="px-3 py-2 text-left font-medium">zh-CN</th>
                  <th className="px-2 py-2 text-left font-medium w-16">Tier</th>
                  <th className="px-2 py-2 text-left font-medium w-28">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {report.rows.map((row) => (
                  <tr key={row.entryId} className="text-gray-300">
                    <td className="px-3 py-2 break-all">{row.en}</td>
                    <td className="px-3 py-2 break-all">{row.zhCN || '—'}</td>
                    <td className="px-2 py-2 text-gray-500">{row.tier ?? '—'}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 border rounded text-[10px] ${
                          STATUS_STYLES[row.status] ?? 'text-gray-400 border-gray-600'
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 break-words">
                      {row.occurrences > 0 && <span>{row.occurrences}×</span>}
                      {row.variants.length > 0 && (
                        <span className="text-amber-300/80">
                          {' '}
                          variant: {row.variants.join(', ')}
                        </span>
                      )}
                      {row.forbidden.length > 0 && (
                        <span className="text-red-400"> ⛔ {row.forbidden.join(', ')}</span>
                      )}
                      {row.occurrences === 0 && row.variants.length === 0 && row.forbidden.length === 0 && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-100 text-xs rounded transition-colors"
          >
            {ui.docGenerator.glossaryUsageClose}
          </button>
        </div>
      </div>
    </div>
  );
};
