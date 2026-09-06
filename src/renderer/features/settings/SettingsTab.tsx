import React, { useEffect, useState } from 'react';
import { AiServicePanel } from './components/AiServicePanel';
import { PromptsPanel } from './components/PromptsPanel';
import { MappingPanel } from './components/MappingPanel';
import { AppInfoPanel } from './components/AppInfoPanel';
import { en as ui } from '../../../shared/i18n';

type SettingsSection = 'ai' | 'prompts' | 'mapping' | 'app';

const SECTIONS: { id: SettingsSection; icon: string; label: string; description: string }[] = [
  { id: 'ai', icon: '🤖', label: ui.settings.ai, description: ui.settings.aiDescription },
  { id: 'prompts', icon: '📝', label: ui.settings.prompts, description: ui.settings.promptsDescription },
  { id: 'mapping', icon: '🔁', label: ui.settings.mapping, description: ui.settings.mappingDescription },
  { id: 'app', icon: '📂', label: ui.settings.app, description: ui.settings.appDescription },
];

/** Settings page with section navigation and a content area. */
export const SettingsTab: React.FC = () => {
  const [section, setSection] = useState<SettingsSection>('ai');
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getVersion().then(setAppVersion).catch((): void => undefined);
  }, []);

  return (
    <div className="flex h-full bg-gray-900">
      {/* Section navigation */}
      <aside className="w-60 shrink-0 border-r border-gray-700 bg-gray-800/60 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">{ui.settings.title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{ui.settings.subtitle}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                section === s.id
                  ? 'bg-blue-600/20 border border-blue-500/40'
                  : 'border border-transparent hover:bg-gray-700/50'
              }`}
            >
              <span className="text-lg leading-none mt-0.5">{s.icon}</span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-medium ${
                    section === s.id ? 'text-blue-300' : 'text-gray-200'
                  }`}
                >
                  {s.label}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">{s.description}</span>
              </span>
            </button>
          ))}
        </nav>
        {/* Version information */}
        <div className="px-4 py-3 border-t border-gray-700">
          <p className="text-xs text-gray-500">{ui.common.productName}</p>
          <p className="text-xs text-gray-600 mt-0.5">{appVersion ? `v${appVersion}` : ui.common.notAvailable}</p>
        </div>
      </aside>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto">
        {section === 'mapping' && <MappingPanel />}
        {section === 'ai' && <AiServicePanel />}
        {section === 'prompts' && <PromptsPanel />}
        {section === 'app' && <AppInfoPanel />}
      </main>
    </div>
  );
};
