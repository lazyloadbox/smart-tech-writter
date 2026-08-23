import React, { useEffect, useState } from 'react';
import { AiServicePanel } from './components/AiServicePanel';
import { PromptsPanel } from './components/PromptsPanel';
import { MappingPanel } from './components/MappingPanel';
import { AppInfoPanel } from './components/AppInfoPanel';

type SettingsSection = 'ai' | 'prompts' | 'mapping' | 'app';

const SECTIONS: { id: SettingsSection; icon: string; label: string; description: string }[] = [
  { id: 'ai', icon: '🤖', label: 'AI 服务配置', description: 'API Key / Base URL / 模型 / RAG 目录' },
  { id: 'prompts', icon: '📝', label: '提示词设置', description: '查看并修改所有流程提示词' },
  { id: 'mapping', icon: '🔁', label: '翻译映射', description: '维护翻译术语映射，支持 Excel 导入' },
  { id: 'app', icon: '📂', label: '应用目录', description: '查看并打开应用相关目录与文件' },
];

/** 设置页：左侧多 tab 导航 + 右侧内容区 */
export const SettingsTab: React.FC = () => {
  const [section, setSection] = useState<SettingsSection>('ai');
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getVersion().then(setAppVersion).catch(() => {});
  }, []);

  return (
    <div className="flex h-full bg-gray-900">
      {/* 左侧 Tab 导航 */}
      <aside className="w-60 shrink-0 border-r border-gray-700 bg-gray-800/60 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">设置</h2>
          <p className="text-xs text-gray-500 mt-0.5">应用配置与提示词管理</p>
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
        {/* 版本信息 */}
        <div className="px-4 py-3 border-t border-gray-700">
          <p className="text-xs text-gray-500">Smart Tech Writer</p>
          <p className="text-xs text-gray-600 mt-0.5">v{appVersion || '...'}</p>
        </div>
      </aside>

      {/* 右侧内容区 */}
      <main className="flex-1 overflow-y-auto">
        {section === 'mapping' && <MappingPanel />}
        {section === 'ai' && <AiServicePanel />}
        {section === 'prompts' && <PromptsPanel />}
        {section === 'app' && <AppInfoPanel />}
      </main>
    </div>
  );
};
