import React, { useEffect, useState } from 'react';
import type { MappingImportParseResult, MappingImportResult } from '../../../../shared/types/mapping.types';

interface MappingImportModalProps {
  parseResult: MappingImportParseResult;
  onClose: () => void;
  onImport: () => Promise<MappingImportResult>;
}

/**
 * 导入预览弹窗：展示解析出的三列映射行（英文 / 简体中文 / 台湾繁体），
 * 确认后导入。文件格式约定：第一列=英文，第二列=简体中文，第三列=台湾繁体
 * （首行表头自动跳过）。
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
          <h3 className="text-sm font-semibold text-gray-100">📥 导入翻译映射</h3>
          <span className="text-xs text-gray-500 truncate">{parseResult.fileName}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{parseResult.rows.length} 行</span>
        </div>

        <div className="px-5 py-4 overflow-y-auto shrink-0">
          <p className="text-[10px] text-gray-500 mb-2">
            列顺序：第一列 = 英文（English），第二列 = 简体中文，第三列 = 台湾繁体（繁體中文）
          </p>

          {/* 预览 */}
          <div className="border border-gray-700 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-700/60 text-gray-300">
                  <th className="px-3 py-1.5 text-left font-medium w-1/3">英文</th>
                  <th className="px-3 py-1.5 text-left font-medium w-1/3">简体中文</th>
                  <th className="px-3 py-1.5 text-left font-medium w-1/3">台湾繁体</th>
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
                      未解析到有效数据行
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {parseResult.rows.length > 10 && (
              <div className="px-3 py-1.5 text-[10px] text-gray-500 border-t border-gray-700/60">
                … 仅显示前 10 行，共 {parseResult.rows.length} 行
              </div>
            )}
          </div>

          {/* 导入结果 */}
          {result && (
            <div className="mt-3 text-xs space-y-1">
              <p className="text-green-400">✅ 已导入 {result.imported} 条</p>
              {result.skipped > 0 && (
                <p className="text-amber-400">⚠️ 跳过 {result.skipped} 条（重复或空行）</p>
              )}
              {result.errors.length > 0 && (
                <div className="max-h-24 overflow-y-auto text-gray-400 space-y-0.5">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <p key={i}>· {e}</p>
                  ))}
                  {result.errors.length > 20 && <p>… 共 {result.errors.length} 条提示</p>}
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
            关闭
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={importing || parseResult.rows.length === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              {importing ? '导入中…' : '✅ 确认导入'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};