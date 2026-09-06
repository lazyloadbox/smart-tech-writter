import React, { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import type { PromptCatalogEntry, PromptKey } from '../../../../shared/types/prompts.types';
import { PromptEditorModal } from './PromptEditorModal';
import { en as ui, formatUi } from '../../../../shared/i18n';

/** Prompt settings panel. */
export const PromptsPanel: React.FC = () => {
  const store = useSettingsStore();
  const [expanded, setExpanded] = useState<Set<PromptKey>>(new Set());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editingKey, setEditingKey] = useState<PromptKey | null>(null);

  useEffect(() => {
    if (!store.promptsLoaded) store.loadPromptsFromIpc();
  }, [store.loadPromptsFromIpc, store.promptsLoaded]);

  // Group catalog entries for display.
  const groups = useMemo(() => {
    const map = new Map<string, PromptCatalogEntry[]>();
    for (const entry of store.promptCatalog) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return Array.from(map.entries());
  }, [store.promptCatalog]);

  const isModified = (entry: PromptCatalogEntry): boolean => {
    const edit = store.promptEdits[entry.key];
    if (!edit) return false;
    return edit.role !== entry.default.role || edit.instructions !== entry.default.instructions;
  };

  const toggle = (key: PromptKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await store.savePromptsToIpc();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : ui.settings.genericSaveError;
      setSaveError(message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = (): void => {
    void handleSave().catch(ignoreSaveError);
  };

  const ignoreSaveError = (error: unknown): undefined => {
    void error;
    return undefined;
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    await store.resetPrompts();
  };

  if (!store.promptsLoaded) {
    return (
      <div className="p-6 text-sm text-gray-400">{ui.common.loading}</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">{ui.settings.promptsTitle}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {ui.settings.promptsPanelDescription}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReset}
            className={`px-3 py-2 text-sm rounded font-medium transition-colors ${
              confirmReset
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            {confirmReset ? ui.settings.confirmRestoreDefaults : ui.settings.restoreDefaults}
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
          >
            {saving ? ui.settings.saving : ui.settings.savePrompts}
          </button>
          {saved && <span className="text-green-400 text-sm">✓ {ui.settings.savedPrompts}</span>}
          {saveError && <span className="max-w-56 text-xs text-red-400" title={saveError}>{ui.settings.saveFailed}</span>}
        </div>
      </div>

      {/* Prompt-to-stage mapping */}
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-4 py-3 space-y-1.5">
          <p className="text-xs font-medium text-gray-300">💡 {ui.settings.promptWorkflowLegendTitle}</p>
          <p className="text-xs text-gray-500 leading-relaxed">
          {ui.settings.promptWorkflowLegend}
          </p>
      </div>

      {groups.map(([group, entries]) => (
        <section key={group} className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-700 pb-2">
            {group}
          </h3>
          {entries.map((entry) => (
            <PromptCard
              key={entry.key}
              entry={entry}
              expanded={expanded.has(entry.key)}
              modified={isModified(entry)}
              onToggle={() => toggle(entry.key)}
              onOpenEditor={() => setEditingKey(entry.key)}
            />
          ))}
        </section>
      ))}

      {editingKey && (() => {
        const entry = store.promptCatalog.find((item) => item.key === editingKey);
        const edit = store.promptEdits[editingKey];
        if (!entry || !edit) return null;
        return (
          <PromptEditorModal
            entry={entry}
            edit={edit}
            onSave={async (nextEdit) => {
              await store.savePrompt(editingKey, nextEdit);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            onClose={() => setEditingKey(null)}
          />
        );
      })()}
    </div>
  );
};

const PromptCard: React.FC<{
  entry: PromptCatalogEntry;
  expanded: boolean;
  modified: boolean;
  onToggle: () => void;
  onOpenEditor: () => void;
}> = ({ entry, expanded, modified, onToggle, onOpenEditor }) => {
  const store = useSettingsStore();
  const edit = store.promptEdits[entry.key];

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          aria-expanded={expanded}
        >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{entry.label}</span>
            {modified && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                {ui.settings.modified}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.description}</p>
          {/* Workflow stage badges */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500">{ui.settings.usedBy}</span>
            {entry.stage.map((s, i) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30"
                title={formatUi(ui.settings.workflowStage, { stage: s })}
              >
                <span className="font-mono">{s}</span>
                <span className="text-blue-400/70">·</span>
                <span>{entry.stageLabel[i] ?? s}</span>
              </span>
            ))}
          </div>
        </div>
          <span className={`text-gray-400 text-xs shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenEditor}
          className="shrink-0 rounded border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20"
          title={ui.settings.editLargeWindow}
        >
          ↗ {ui.settings.editLargeWindow}
        </button>
      </div>

      {expanded && edit && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-700 pt-3">
          <PromptTextarea
            label={ui.settings.promptRoleLabel}
            value={edit.role}
            onChange={(v) => store.setPromptRole(entry.key, v)}
            rows={4}
          />
          <PromptTextarea
            label={ui.settings.promptInstructionsLabel}
            value={edit.instructions}
            onChange={(v) => store.setPromptInstructions(entry.key, v)}
            rows={12}
          />
          <div className="rounded border border-gray-700 bg-gray-900/60 px-3 py-2">
            <p className="text-xs font-medium text-gray-400">{ui.settings.promptOutputFormatLabel}</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-950 p-2 text-[10px] leading-relaxed text-emerald-300 whitespace-pre-wrap">{JSON.stringify(entry.default.outputFormat.display, null, 2)}</pre>
          </div>
          <button
            type="button"
            onClick={onOpenEditor}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600"
          >
            ↗ {ui.settings.openMarkdownPreview}
          </button>
        </div>
      )}
    </div>
  );
};

const PromptTextarea: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}> = ({ label, value, onChange, rows }) => (
  <div className="space-y-1">
    <label className="block text-xs font-medium text-gray-400">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      spellCheck={false}
      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono leading-relaxed resize-y"
    />
  </div>
);
