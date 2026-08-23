import React, { useEffect } from 'react';
import { XmlHighlight } from '../../doc-generator/components/xml/XmlHighlight';
import type { LocalizationFileResult } from '../../../../shared/types/localization.types';

const LANG_LABELS: Record<string, string> = {
  en: 'English（英文）',
  'zh-CN': '简体中文（中国大陆）',
  'zh-TW': '繁體中文（台灣）',
};

interface LocalizePreviewModalProps {
  result: LocalizationFileResult;
  onClose: () => void;
}

/**
 * Modal that previews a localized file's export name and final XML content.
 *
 * Shows:
 *  - the export file name (with the language suffix, e.g. `综合技术文档.zh-TW.dita`),
 *  - the source file name and target language,
 *  - the XML validation status (with remaining errors when not well-formed),
 *  - the final content, syntax-highlighted and read-only.
 */
export const LocalizePreviewModal: React.FC<LocalizePreviewModalProps> = ({ result, onClose }) => {
  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const langLabel = LANG_LABELS[result.targetLanguage] ?? result.targetLanguage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-4xl h-[85vh] bg-gray-900 rounded-lg border border-gray-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-100 truncate">📄 {result.exportFileName}</h3>
          <span className="px-2 py-0.5 bg-blue-600/20 text-blue-300 text-[11px] rounded whitespace-nowrap">
            {langLabel}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
          >
            ✕ 关闭
          </button>
        </div>

        {/* Meta info */}
        <div className="shrink-0 px-4 py-2 bg-gray-900 border-b border-gray-700/60 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
          <span>
            源文件：<span className="text-gray-300">{result.fileName}</span>
          </span>
          <span>
            导出文件名：<span className="text-gray-300 font-mono">{result.exportFileName}</span>
          </span>
          {result.status === 'done' && (
            <span
              className={
                result.validated
                  ? result.repaired
                    ? 'text-amber-400'
                    : 'text-green-400'
                  : 'text-red-400'
              }
            >
              {result.validated
                ? result.repaired
                  ? '⚠️ 已自动修复 XML 问题'
                  : '✅ XML 校验通过'
                : '❌ XML 校验未通过'}
            </span>
          )}
        </div>

        {/* Remaining validation errors (if any) */}
        {!result.validated && result.validationErrors && result.validationErrors.length > 0 && (
          <div className="shrink-0 px-4 py-2 bg-red-900/20 border-b border-red-800/50">
            <p className="text-xs text-red-300 font-medium mb-1">校验错误：</p>
            <ul className="list-disc list-inside text-xs text-red-300/90 space-y-0.5">
              {result.validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-gray-950/40">
          <XmlHighlight code={result.content} />
        </div>
      </div>
    </div>
  );
};