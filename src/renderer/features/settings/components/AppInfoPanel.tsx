import React, { useEffect, useState } from 'react';
import type { AppPaths } from '../../../../shared/types/ipc.types';

interface PathRow {
  key: keyof AppPaths;
  icon: string;
  label: string;
  description: string;
  /** 是否为文件（文件在资源管理器中定位，目录直接打开） */
  isFile?: boolean;
}

const PATH_ROWS: PathRow[] = [
  {
    key: 'appPath',
    icon: '🚀',
    label: '应用执行目录',
    description: '应用安装 / 程序所在目录',
  },
  {
    key: 'userData',
    icon: '⚙️',
    label: '设置与数据目录',
    description: '应用配置、数据库、项目文件等均存放于此',
  },
  {
    key: 'databasePath',
    icon: '🗄️',
    label: '主数据库文件',
    description: 'SQLite 数据库（smart-tech-writer.db），保存设置、项目与 RAG 索引',
    isFile: true,
  },
  {
    key: 'langgraphDbPath',
    icon: '🔖',
    label: '工作流检查点数据库',
    description: 'LangGraph 检查点（langgraph.db），用于暂停 / 恢复 / 回退',
    isFile: true,
  },
  {
    key: 'projectsDir',
    icon: '📁',
    label: '项目文件目录',
    description: '每个项目的解析结果、草稿与输出文档存放目录',
  },
  {
    key: 'logsDir',
    icon: '📜',
    label: '日志目录',
    description: '应用运行日志（electron-log）',
  },
];

/** 应用目录信息面板（设置页「应用目录」tab） */
export const AppInfoPanel: React.FC = () => {
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [error, setError] = useState<string>('');
  const [opening, setOpening] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app
      .getPaths()
      .then(setPaths)
      .catch((err) => setError(String(err)));
  }, []);

  const handleOpen = async (key: keyof AppPaths) => {
    if (!paths) return;
    const target = paths[key];
    if (!target) return;
    setOpening(key);
    try {
      await window.electronAPI.app.openPath(target);
    } catch (err) {
      setError(String(err));
    } finally {
      setOpening('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">应用目录</h2>
        <p className="text-xs text-gray-500 mt-1">
          查看本应用相关的目录与文件位置，点击「打开」可在资源管理器中快速定位。
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-900/40 border border-red-700 rounded text-sm text-red-300">
          加载失败：{error}
        </div>
      )}

      <section className="space-y-3">
        {PATH_ROWS.map((row) => {
          const value = paths?.[row.key] ?? '';
          return (
            <div
              key={row.key}
              className="flex items-center gap-3 px-4 py-3 bg-gray-800/60 border border-gray-700 rounded-lg"
            >
              <span className="text-xl leading-none shrink-0">{row.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{row.label}</span>
                  {row.isFile && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30">
                      文件
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
                <p
                  className="text-xs font-mono text-gray-400 mt-1 truncate"
                  title={value}
                >
                  {value || '...'}
                </p>
              </div>
              <button
                onClick={() => handleOpen(row.key)}
                disabled={!value || opening === row.key}
                className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-blue-600 disabled:opacity-40 text-xs text-gray-100 rounded transition-colors"
              >
                {opening === row.key ? '打开中...' : '打开'}
              </button>
            </div>
          );
        })}
      </section>

      <p className="text-xs text-gray-600">
        提示：数据库文件正在被应用使用时，请勿直接修改；如需备份，可先退出应用再复制。
      </p>
    </div>
  );
};