import React, { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import type { PromptCatalogEntry, PromptKey } from '../../../../shared/types/prompts.types';

/** 提示词设置面板（设置页第二个 tab） */
export const PromptsPanel: React.FC = () => {
  const store = useSettingsStore();
  const [expanded, setExpanded] = useState<Set<PromptKey>>(new Set());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!store.promptsLoaded) store.loadPromptsFromIpc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 按 group 分组
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
    return (
      edit.role !== entry.default.role ||
      edit.task !== entry.default.task ||
      edit.outputFormat !== entry.default.outputFormat
    );
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
    try {
      await store.savePromptsToIpc();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
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
      <div className="p-6 text-sm text-gray-400">正在加载提示词配置...</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">提示词设置</h2>
          <p className="text-xs text-gray-500 mt-1">
            查看并修改工作流中所有 AI 提示词（角色 / 任务 / 输出格式）。
            修改后保存即生效，下次运行工作流时使用新提示词。
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
            {confirmReset ? '确认恢复默认？' : '恢复默认'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
          >
            {saving ? '保存中...' : '保存提示词'}
          </button>
          {saved && <span className="text-green-400 text-sm">✓ 已保存</span>}
        </div>
      </div>

      {/* 图例：说明每个提示词对应的工作流步骤 */}
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg px-4 py-3 space-y-1.5">
        <p className="text-xs font-medium text-gray-300">💡 每个提示词对应的工作流步骤</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          每个提示词卡片下方的蓝色徽标标明该提示词在哪个步骤（step）被使用，格式为{' '}
          <code className="text-gray-400">步骤key · 步骤名称</code>。例如「文件解析 Agent」用于
          <span className="text-blue-300"> upload_parse · 上传 &amp; 解析</span> 步骤。
          修改提示词后，对应步骤在下一次运行时即使用新内容。
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
            />
          ))}
        </section>
      ))}
    </div>
  );
};

const PromptCard: React.FC<{
  entry: PromptCatalogEntry;
  expanded: boolean;
  modified: boolean;
  onToggle: () => void;
}> = ({ entry, expanded, modified, onToggle }) => {
  const store = useSettingsStore();
  const edit = store.promptEdits[entry.key];

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-800 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">{entry.label}</span>
            {modified && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                已修改
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.description}</p>
          {/* 对应的工作流 step 徽标 */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500">用于步骤:</span>
            {entry.stage.map((s, i) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30"
                title={`工作流阶段: ${s}`}
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

      {expanded && edit && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-700 pt-3">
          <PromptTextarea
            label="角色设定 (role)"
            value={edit.role}
            onChange={(v) => store.setPromptPart(entry.key, 'role', v)}
            rows={3}
          />
          <PromptTextarea
            label="任务描述 (task)"
            value={edit.task}
            onChange={(v) => store.setPromptPart(entry.key, 'task', v)}
            rows={6}
          />
          <PromptTextarea
            label="输出格式 (outputFormat)"
            value={edit.outputFormat}
            onChange={(v) => store.setPromptPart(entry.key, 'outputFormat', v)}
            rows={3}
          />
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