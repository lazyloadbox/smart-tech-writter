import React from 'react';
import type { OutputDocument } from '../../../../shared/types/document.types';
import { en as ui } from '../../../../shared/i18n';

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

  const handleDownloadZip = () => {
    window.electronAPI.file.downloadZip(projectId);
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
              <button
                onClick={() => handleSaveAs(doc.filePath, doc.fileName, doc.format)}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
              >
                💾 {ui.docGenerator.exportTo}
              </button>
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
        <div className="flex gap-3">
          <button
            onClick={handleExportAll}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors font-medium"
          >
            📁 {ui.docGenerator.exportAll}
          </button>
          {documents.length > 1 && (
            <button
              onClick={handleDownloadZip}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 rounded transition-colors"
            >
              {ui.docGenerator.downloadZip}
            </button>
          )}
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
    </div>
  );
};
