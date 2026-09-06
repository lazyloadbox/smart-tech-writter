import React, { useCallback, useState } from 'react';
import type { UploadedFile, DocumentOutline } from '../../../../shared/types/document.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface InputPanelProps {
  files: UploadedFile[];
  onFilesAdded: (files: UploadedFile[]) => void;
  onRemoveFile: (id: string) => void;
  onUpdateFileInstruction: (id: string, instruction: string) => void;
  onStartWorkflow: (
    filePaths: string[],
    outline?: DocumentOutline,
    parseInstruction?: string,
    fileInstructions?: Record<string, string>
  ) => void;
  isStarting: boolean;
}

const DEFAULT_SECTIONS = [
  'Executive Summary',
  'Product/Feature Overview',
  'Technical Specifications',
  'Key Features and Functions',
  'Requirements and Dependencies',
  'Implementation Notes',
];

export const InputPanel: React.FC<InputPanelProps> = ({
  files, onFilesAdded, onRemoveFile, onUpdateFileInstruction, onStartWorkflow, isStarting,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [outlineText, setOutlineText] = useState(DEFAULT_SECTIONS.join('\n'));
  const [mergeIntoSingle, setMergeIntoSingle] = useState(true);
  const [showParsePrompt, setShowParsePrompt] = useState(false);
  const [parseInstruction, setParseInstruction] = useState('');

  const buildOutline = (): DocumentOutline => ({
    sections: outlineText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    mergeIntoSingle,
  });

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
      <h2 className="text-lg font-semibold text-gray-100">{ui.docGenerator.stageZero}</h2>

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
          <p>{ui.docGenerator.dropFiles} <span className="text-blue-400 underline">{ui.docGenerator.chooseFiles}</span></p>
          <p className="text-xs mt-1 text-gray-500">{ui.docGenerator.supportedFiles}</p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase font-semibold">{formatUi(ui.docGenerator.addedFiles, { count: files.length })}</p>
          {files.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              onRemove={() => onRemoveFile(f.id)}
              onUpdateInstruction={(instruction) => onUpdateFileInstruction(f.id, instruction)}
            />
          ))}
        </div>
      )}

      {/* Document outline settings */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowOutline((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors"
        >
          <span>📑 {ui.docGenerator.outlineSettings}</span>
          <span className="text-gray-400">{showOutline ? '▲' : '▼'}</span>
        </button>
        {showOutline && (
          <div className="p-4 space-y-3 bg-gray-900/50">
            <div>
              <p className="text-xs text-gray-400 mb-1">{ui.docGenerator.sectionTitles}</p>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                placeholder={ui.docGenerator.sectionPlaceholder}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={mergeIntoSingle}
                onChange={(e) => setMergeIntoSingle(e.target.checked)}
                className="accent-blue-500"
              />
              {ui.docGenerator.mergeDocuments}
            </label>
            <button
              type="button"
              onClick={() => setOutlineText(DEFAULT_SECTIONS.join('\n'))}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 rounded transition-colors"
            >
              {ui.docGenerator.restoreOutline}
            </button>
          </div>
        )}
      </div>

      {/* Parsing instructions */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowParsePrompt((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors"
        >
          <span>🧠 {ui.docGenerator.parsePromptSettings}</span>
          <span className="text-gray-400">{showParsePrompt ? '▲' : '▼'}</span>
        </button>
        {showParsePrompt && (
          <div className="p-4 space-y-3 bg-gray-900/50">
            <div>
              <p className="text-xs text-gray-400 mb-1">{ui.docGenerator.globalParsePrompt} — {ui.docGenerator.globalParsePromptHelp}</p>
              <textarea
                value={parseInstruction}
                onChange={(e) => setParseInstruction(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                placeholder={ui.docGenerator.parsePromptPlaceholder}
              />
            </div>
            <p className="text-xs text-gray-500">
              💡 {ui.docGenerator.parsePromptHint}
            </p>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSelectFiles}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded text-gray-200 transition-colors"
        >
          + {ui.docGenerator.addMoreFiles}
        </button>
        <button
          disabled={readyFiles.length === 0 || isStarting}
          onClick={() => {
            const fileInstructions: Record<string, string> = {};
            for (const f of files) {
              if (f.parseInstruction?.trim()) fileInstructions[f.path] = f.parseInstruction.trim();
            }
            onStartWorkflow(
              files.filter((f) => f.parseStatus !== 'error').map((f) => f.path),
              buildOutline(),
              parseInstruction.trim() || undefined,
              Object.keys(fileInstructions).length > 0 ? fileInstructions : undefined
            );
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm rounded text-white font-medium transition-colors"
        >
          {isStarting ? ui.docGenerator.starting : `${formatUi(ui.docGenerator.confirmAndStart, { count: readyFiles.length })} ▶`}
        </button>
      </div>
    </div>
  );
};

const FileCard: React.FC<{
  file: UploadedFile;
  onRemove: () => void;
  onUpdateInstruction: (instruction: string) => void;
}> = ({ file, onRemove, onUpdateInstruction }) => {
  const [showInstruction, setShowInstruction] = useState(false);
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
            {file.parseStatus === 'pending' && ui.docGenerator.parsePending}
            {file.parseStatus === 'parsing' && ui.docGenerator.parsing}
            {file.parseStatus === 'done' && `→ ${ui.docGenerator.parseComplete}`}
            {file.parseStatus === 'error' && `→ ${formatUi(ui.docGenerator.parseError, { message: file.parseError ?? '' })}`}
          </span>
          <button
            onClick={() => setShowInstruction((v) => !v)}
            className={`text-xs shrink-0 transition-colors ${file.parseInstruction?.trim() ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}
            title={ui.docGenerator.filePromptTitle}
          >
            🧠 {ui.docGenerator.filePrompt}{file.parseInstruction?.trim() ? ' ✓' : ''}
          </button>
        </div>
        {showInstruction && (
          <div className="mt-2">
            <textarea
              value={file.parseInstruction ?? ''}
              onChange={(e) => onUpdateInstruction(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              placeholder={ui.docGenerator.filePromptPlaceholder}
            />
          </div>
        )}
        {file.parseSummary && (
          <p className="text-xs text-gray-400 mt-1 truncate">↳ {file.parseSummary}</p>
        )}
        {file.parseExtraction && file.parseExtraction.items.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-blue-400 hover:text-blue-300">
              🔎 Extracted information ({file.parseExtraction.items.length})
            </summary>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded bg-gray-900 p-2 text-[11px] text-gray-400">
              {file.parseExtraction.items.slice(0, 10).map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <span className="text-gray-300">[{item.importance}] {item.title}:</span> {item.content}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 text-sm shrink-0"
        title={ui.common.remove}
      >
        ✕
      </button>
    </div>
  );
};
