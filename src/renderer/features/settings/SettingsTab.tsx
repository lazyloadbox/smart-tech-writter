import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settings.store';

export const SettingsTab: React.FC = () => {
  const store = useSettingsStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    store.loadFromIpc();
  }, []);

  const handleSave = async () => {
    await store.saveToIpc();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h2 className="text-xl font-semibold text-gray-100">设置</h2>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-700 pb-2">
          AI 服务配置
        </h3>
        <p className="text-xs text-gray-500">
          兼容 OpenAI API 格式的服务均可使用，例如{' '}
          <span className="text-gray-400">302.ai</span>。
          Base URL 填写服务商的 API 前缀（不含 <code className="text-gray-400">/chat/completions</code>），
          SDK 会自动补全路径。
        </p>
        <Field
          label="API Key"
          type="password"
          placeholder="sk-..."
          value={store.openaiApiKey}
          onChange={store.setOpenaiApiKey}
        />
        <Field
          label="Base URL（302.ai 填 https://api.302.ai/v1）"
          placeholder="https://api.302.ai/v1"
          value={store.openaiBaseURL}
          onChange={store.setOpenaiBaseURL}
        />
        <Field
          label="模型"
          placeholder="gpt-4o"
          value={store.openaiModel}
          onChange={store.setOpenaiModel}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-700 pb-2">
          本地文档搜索 (RAG Placeholder)
        </h3>
        <Field
          label="搜索目录路径"
          placeholder="C:/Documents/References"
          value={store.ragSearchDirectory}
          onChange={store.setRagSearchDirectory}
        />
        <p className="text-xs text-gray-500">
          AI 分析阶段会在此目录内搜索相关参考文档作为上下文输入
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
        >
          保存设置
        </button>
        {saved && <span className="text-green-400 text-sm">✓ 已保存</span>}
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
