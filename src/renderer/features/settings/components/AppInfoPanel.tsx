import React, { useEffect, useState } from 'react';
import type { AppPaths } from '../../../../shared/types/ipc.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface PathRow {
  key: keyof AppPaths;
  icon: string;
  label: string;
  description: string;
  /** Whether the item is a file (locate it) or a directory (open it). */
  isFile?: boolean;
}

const PATH_ROWS: PathRow[] = [
  {
    key: 'appPath',
    icon: '🚀',
    label: ui.settings.appPaths.appPath.label,
    description: ui.settings.appPaths.appPath.description,
  },
  {
    key: 'userData',
    icon: '⚙️',
    label: ui.settings.appPaths.userData.label,
    description: ui.settings.appPaths.userData.description,
  },
  {
    key: 'databasePath',
    icon: '🗄️',
    label: ui.settings.appPaths.databasePath.label,
    description: ui.settings.appPaths.databasePath.description,
    isFile: true,
  },
  {
    key: 'langgraphDbPath',
    icon: '🔖',
    label: ui.settings.appPaths.langgraphDbPath.label,
    description: ui.settings.appPaths.langgraphDbPath.description,
    isFile: true,
  },
  {
    key: 'projectsDir',
    icon: '📁',
    label: ui.settings.appPaths.projectsDir.label,
    description: ui.settings.appPaths.projectsDir.description,
  },
  {
    key: 'logsDir',
    icon: '📜',
    label: ui.settings.appPaths.logsDir.label,
    description: ui.settings.appPaths.logsDir.description,
  },
];

/** Application data and path information panel. */
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
        <h2 className="text-xl font-semibold text-gray-100">{ui.settings.appInfoTitle}</h2>
        <p className="text-xs text-gray-500 mt-1">
          {ui.settings.appInfoDescription}
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-900/40 border border-red-700 rounded text-sm text-red-300">
          {formatUi(ui.settings.loadFailed, { error })}
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
                      {ui.settings.file}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
                <p
                  className="text-xs font-mono text-gray-400 mt-1 truncate"
                  title={value}
                >
                  {value || ui.common.notAvailable}
                </p>
              </div>
              <button
                onClick={() => handleOpen(row.key)}
                disabled={!value || opening === row.key}
                className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-blue-600 disabled:opacity-40 text-xs text-gray-100 rounded transition-colors"
              >
                {opening === row.key ? ui.settings.opening : ui.settings.openItem}
              </button>
            </div>
          );
        })}
      </section>

      <p className="text-xs text-gray-600">
        {ui.settings.appInfoWarning}
      </p>
    </div>
  );
};
