import React, { useState } from 'react';
import type { DocumentDraft } from '../../../../shared/types/document.types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DraftViewerProps {
  drafts: DocumentDraft[];
}

export const DraftViewer: React.FC<DraftViewerProps> = ({ drafts }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  if (drafts.length === 0) return null;

  const active = drafts[activeIdx];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      {drafts.length > 1 && (
        <div className="flex border-b border-gray-700 px-4 bg-gray-800 shrink-0">
          {drafts.map((d, idx) => (
            <button
              key={d.id}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                idx === activeIdx ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
      {/* Content — rendered as Markdown */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-base font-semibold text-gray-100 mb-3">{active.title}</h3>
        <MarkdownRenderer content={active.content} />
      </div>
    </div>
  );
};
