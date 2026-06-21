import React, { useEffect, useState, useMemo } from 'react';
import type { UploadedFile } from '../../../../shared/types/document.types';

interface FilePreviewModalProps {
  file: UploadedFile | null;
  onClose: () => void;
}

/**
 * Categorize a file by extension to pick the right preview renderer.
 * Mirrors the backend file-readers selection (word/pdf/email/code/text).
 */
function getFileKind(filePath: string): 'pdf' | 'word' | 'email' | 'code' | 'text' | 'image' {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'word';
  if (ext === 'eml') return 'email';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sh', 'bash'].includes(ext)) return 'code';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  return 'text';
}

/** Map code extensions to a human-readable language label for the header. */
const CODE_LANG_LABEL: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript (React)', js: 'JavaScript', jsx: 'JavaScript (React)',
  py: 'Python', java: 'Java', c: 'C', cpp: 'C++', h: 'C/C++ Header', cs: 'C#',
  go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin',
  sh: 'Shell', bash: 'Bash',
};

/**
 * Modal popup that previews an uploaded file's original content.
 *
 * Preview strategy per file kind:
 * - pdf / word / email: binary/parsed formats — use the `extractedText`
 *   that the backend parser already stored on the UploadedFile during
 *   upload_parse. We don't re-read the raw file (it would be binary noise).
 * - code / text: plain-text formats — read the raw file via
 *   `window.electronAPI.file.readFile()` so the user sees the true source.
 * - image: not supported by the text-based readFile IPC; show a notice.
 *
 * The modal is a fixed overlay with a backdrop; click backdrop or Esc to close.
 */
export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = useMemo(() => (file ? getFileKind(file.path) : 'text'), [file]);

  useEffect(() => {
    if (!file) return;
    setContent('');
    setError(null);

    // For parsed (binary) formats, use the already-extracted text.
    if (kind === 'pdf' || kind === 'word' || kind === 'email') {
      if (file.extractedText) {
        setContent(file.extractedText);
      } else {
        setError('该文件类型暂无已提取的文本预览（解析阶段未保存原文文本）。');
      }
      return;
    }

    if (kind === 'image') {
      setError('图片文件预览暂不支持。');
      return;
    }

    // code / text — read raw file from disk via IPC.
    let cancelled = false;
    setLoading(true);
    window.electronAPI.file
      .readFile(file.path)
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`读取文件失败: ${err instanceof Error ? err.message : String(err)}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, kind]);

  // Esc to close
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, onClose]);

  if (!file) return null;

  const kindLabel =
    kind === 'pdf' ? 'PDF 文档' :
    kind === 'word' ? 'Word 文档' :
    kind === 'email' ? '邮件 (.eml)' :
    kind === 'code' ? `代码 (${CODE_LANG_LABEL[file.path.split('.').pop()?.toLowerCase() ?? ''] ?? '源码'})` :
    kind === 'image' ? '图片' : '文本文件';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-4xl h-[80vh] bg-gray-900 rounded-lg border border-gray-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center gap-3">
          <span className="text-base">📄</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-100 truncate">{file.name}</p>
            <p className="text-[11px] text-gray-500 truncate">{kindLabel} · {file.path}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-red-400 text-lg leading-none px-2"
            title="关闭 (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 bg-gray-900">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              正在读取文件内容...
            </div>
          )}
          {error && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded text-sm text-yellow-300">
              ⚠ {error}
            </div>
          )}
          {!loading && !error && content && (
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words leading-relaxed">
              {content}
            </pre>
          )}
          {!loading && !error && !content && (
            <p className="text-sm text-gray-500 text-center py-8">文件内容为空</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center justify-between text-[11px] text-gray-500">
          <span>{content.length.toLocaleString()} 字符</span>
          <span>按 Esc 关闭</span>
        </div>
      </div>
    </div>
  );
};
