import React, { useEffect, useMemo, useState } from 'react';
import type { PromptCatalogEntry } from '../../../../shared/types/prompts.types';
import type { PromptEditState } from '../../../stores/settings.store';
import { MarkdownRenderer } from '../../doc-generator/components/MarkdownRenderer';
import { en as ui } from '../../../../shared/i18n';

interface PromptEditorModalProps {
  entry: PromptCatalogEntry;
  edit: PromptEditState;
  onSave: (edit: PromptEditState) => Promise<void>;
  onClose: () => void;
}

/** Large editor for long prompts. The prompt remains Markdown source in state. */
export const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  entry, edit, onSave, onClose,
}) => {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState<PromptEditState>(edit);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, saving]);

  const previewContent = useMemo(() => [
    `## System Role\n${draft.role}`,
    `## Supplemental Instructions\n${draft.instructions}`,
    `## Output Format (read-only)\n\`\`\`json\n${JSON.stringify(entry.default.outputFormat.display, null, 2)}\n\`\`\``,
  ].join('\n\n'), [draft, entry.default.outputFormat]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : ui.settings.genericSaveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex h-[min(90vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-600 bg-gray-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-700 bg-gray-800 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="prompt-editor-title" className="truncate text-base font-semibold text-gray-100">
                {entry.label}
              </h2>
              <code className="hidden shrink-0 text-[10px] text-gray-500 sm:inline">{entry.key}</code>
            </div>
            <p className="mt-1 text-xs text-gray-400">{entry.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 rounded px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-700 hover:text-gray-100 disabled:opacity-50"
            aria-label={ui.settings.promptEditorCloseLabel}
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-700 bg-gray-800/70 px-5 py-2">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`rounded px-3 py-1.5 text-xs font-medium ${mode === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
          >
            {ui.settings.editMarkdown}
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`rounded px-3 py-1.5 text-xs font-medium ${mode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
          >
            {ui.settings.previewRendered}
          </button>
          <span className="ml-auto text-[11px] text-gray-500">
            {previewContent.length.toLocaleString()} {ui.common.characters}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {mode === 'preview' ? (
            <div className="mx-auto min-h-full max-w-4xl rounded-lg border border-gray-700 bg-gray-950 p-6">
              <MarkdownRenderer content={previewContent} className="prompt-preview" />
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400">{ui.settings.promptRoleLabel}</label>
                <p className="mt-1 text-[11px] text-gray-500">{ui.settings.promptRoleDescription}</p>
                <textarea
                  value={draft.role}
                  onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                  spellCheck={false}
                  rows={4}
                  className="mt-2 w-full resize-y rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 font-mono text-sm leading-relaxed text-gray-200 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400">{ui.settings.promptInstructionsLabel}</label>
                <p className="mt-1 text-[11px] text-gray-500">{ui.settings.promptInstructionsDescription}</p>
                <textarea
                  value={draft.instructions}
                  onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
                  spellCheck={false}
                  className="mt-2 min-h-[38vh] w-full resize-y rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 font-mono text-sm leading-relaxed text-gray-200 outline-none focus:border-blue-500"
                />
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4">
                <label className="block text-xs font-medium text-gray-400">{ui.settings.promptOutputFormatLabel}</label>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-gray-950 p-3 text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap">{JSON.stringify(entry.default.outputFormat.display, null, 2)}</pre>
                <p className="mt-2 text-[11px] text-amber-400">{ui.settings.promptOutputFormatHint}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-700 bg-gray-800 px-5 py-3">
          <span className="mr-auto text-xs text-gray-500">
            {ui.settings.promptSystemHint}
          </span>
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            {ui.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? ui.settings.saving : ui.settings.saveAndClose}
          </button>
        </div>
      </div>
    </div>
  );
};
