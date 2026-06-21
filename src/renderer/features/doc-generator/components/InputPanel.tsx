import React, { useCallback, useState } from 'react';
import type { UploadedFile } from '../../../../shared/types/document.types';

interface InputPanelProps {
  files: UploadedFile[];
  onFilesAdded: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  onStartWorkflow: (filePaths: string[]) => void;
  isStarting: boolean;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  files, onFilesAdded, onRemoveFile, onStartWorkflow, isStarting,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleSelectFiles = async () => {
    const paths = await window.electronAPI.file.selectFiles();
    if (paths.length === 0) return;
    const newFiles: UploadedFile[] = paths.map((p) => ({
      id: crypto.randomUUID(),
      name: p.split(/[/\\]/).pop() ?? p,
      path: p,
      size: 0,
      type: p.split('.').pop() ?? '',
      parseStatus: 'pending',
    }));
    onFilesAdded(newFiles);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // In Electron, file.path contains the full native path
    const paths = Array.from(e.dataTransfer.files).map((f) => (f as File & { path: string }).path).filter(Boolean);
    const newFiles: UploadedFile[] = paths.map((p) => ({
      id: crypto.randomUUID(),
      name: p.split(/[/\\]/).pop() ?? p,
      path: p,
      size: 0,
      type: p.split('.').pop() ?? '',
      parseStatus: 'pending',
    }));
    onFilesAdded(newFiles);
  }, [onFilesAdded]);

  const readyFiles = files.filter((f) => f.parseStatus === 'done' || f.parseStatus === 'pending');

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-100">Stage 0 — 上传 & 解析</h2>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragOver ? 'border-blue-400 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'
        }`}
        onClick={handleSelectFiles}
      >
        <div className="text-gray-400 text-sm">
          <div className="text-2xl mb-2">📂</div>
          <p>拖拽文件到此处，或 <span className="text-blue-400 underline">选择文件</span></p>
          <p className="text-xs mt-1 text-gray-500">支持: .docx  .pdf  .txt  .md  .eml  代码文件</p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase font-semibold">已添加文件 ({files.length})</p>
          {files.map((f) => (
            <FileCard key={f.id} file={f} onRemove={() => onRemoveFile(f.id)} />
          ))}
        </div>
      )}

      {/* Action */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSelectFiles}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded text-gray-200 transition-colors"
        >
          + 继续添加文件
        </button>
        <button
          disabled={readyFiles.length === 0 || isStarting}
          onClick={() => onStartWorkflow(files.filter(f => f.parseStatus !== 'error').map(f => f.path))}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm rounded text-white font-medium transition-colors"
        >
          {isStarting ? '启动中...' : `确认全部，开始工作流 ▶ (${readyFiles.length} 文件)`}
        </button>
      </div>
    </div>
  );
};

const FileCard: React.FC<{ file: UploadedFile; onRemove: () => void }> = ({ file, onRemove }) => {
  const statusIcon = {
    pending: '○',
    parsing: '⏳',
    done: '✅',
    error: '❌',
  }[file.parseStatus];

  const statusColor = {
    pending: 'text-gray-400',
    parsing: 'text-yellow-400',
    done: 'text-green-400',
    error: 'text-red-400',
  }[file.parseStatus];

  return (
    <div className="flex items-start gap-3 p-3 bg-gray-800 rounded border border-gray-700">
      <span className="mt-0.5 text-base">{statusIcon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200 truncate">{file.name}</span>
          <span className={`text-xs ${statusColor}`}>
            {file.parseStatus === 'pending' && '待解析'}
            {file.parseStatus === 'parsing' && '正在解析...'}
            {file.parseStatus === 'done' && '→ AI解析完成'}
            {file.parseStatus === 'error' && `→ 错误: ${file.parseError}`}
          </span>
        </div>
        {file.parseSummary && (
          <p className="text-xs text-gray-400 mt-1 truncate">↳ {file.parseSummary}</p>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 text-sm shrink-0"
        title="移除"
      >
        ✕
      </button>
    </div>
  );
};
