import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import { en as ui } from '../../../../shared/i18n';

/** AI service configuration panel. */
export const AiServicePanel: React.FC = () => {
  const store = useSettingsStore();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    store.loadFromIpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await store.saveToIpc();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">{ui.settings.aiServiceTitle}</h2>
        <p className="text-xs text-gray-500 mt-1">
          {ui.settings.aiServiceDescription}
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-700 pb-2">
          {ui.settings.openAiCompatible}
        </h3>
        <p className="text-xs text-gray-500">
          {ui.settings.openAiCompatibleDescription}
        </p>
        <Field
          label={ui.settings.apiKey}
          type="password"
          placeholder={ui.settings.apiKeyPlaceholder}
          value={store.openaiApiKey}
          onChange={store.setOpenaiApiKey}
        />
        <Field
          label={ui.settings.baseUrl}
          placeholder={ui.settings.baseUrlPlaceholder}
          value={store.openaiBaseURL}
          onChange={store.setOpenaiBaseURL}
        />
        <Field
          label={ui.settings.model}
          placeholder={ui.settings.modelPlaceholder}
          value={store.openaiModel}
          onChange={store.setOpenaiModel}
        />
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-400">{ui.settings.reasoningEffort}</label>
          <select
            value={store.openaiReasoningEffort}
            onChange={(event) => store.setOpenaiReasoningEffort(event.target.value as typeof store.openaiReasoningEffort)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="none">{ui.settings.reasoningEffortNone}</option>
            <option value="low">{ui.settings.reasoningEffortLow}</option>
            <option value="medium">{ui.settings.reasoningEffortMedium}</option>
            <option value="high">{ui.settings.reasoningEffortHigh}</option>
          </select>
          <p className="text-[11px] text-gray-500">{ui.settings.reasoningEffortHelp}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-700 pb-2">
          {ui.settings.ragTitle}
        </h3>
        <Field
          label={ui.settings.ragDirectory}
          placeholder={ui.settings.ragDirectoryPlaceholder}
          value={store.ragSearchDirectory}
          onChange={store.setRagSearchDirectory}
        />
        <p className="text-xs text-gray-500">
          {ui.settings.ragDescription}
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
        >
          {saving ? ui.settings.saving : ui.settings.saveSettings}
        </button>
        {saved && <span className="text-green-400 text-sm">✓ {ui.settings.saved}</span>}
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div className="space-y-1">
    <label className="block text-xs font-medium text-gray-400">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
    />
  </div>
);
