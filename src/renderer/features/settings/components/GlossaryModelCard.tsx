import React, { useEffect, useState } from 'react';
import { useMappingStore } from '../../../stores/mapping.store';
import { glossaryApi } from '../../../api/glossary.api';
import { en as ui, formatUi } from '../../../../shared/i18n';
import type {
  GlossaryModelProgress,
  GlossaryModelStatus,
  GlossaryRuntimeBackend,
} from '../../../../shared/types/glossary.types';

/** Status icon + label for the model card header (design §2.11.3). */
function statusBadge(status: GlossaryModelStatus): { icon: string; label: string; tone: string } {
  switch (status.state) {
    case 'ready':
      return { icon: '✅', label: ui.settings.glossaryModelStateReady, tone: 'text-emerald-400' };
    case 'downloading':
      return { icon: '⬇️', label: ui.settings.glossaryModelStateDownloading, tone: 'text-blue-400' };
    case 'installing':
      return { icon: '📦', label: ui.settings.glossaryModelStateInstalling, tone: 'text-blue-400' };
    case 'verifying':
      return { icon: '🔍', label: ui.settings.glossaryModelStateVerifying, tone: 'text-blue-400' };
    case 'degraded':
      return { icon: '⚠️', label: ui.settings.glossaryModelStateDegraded, tone: 'text-amber-400' };
    case 'failed':
      return { icon: '❌', label: ui.settings.glossaryModelStateFailed, tone: 'text-red-400' };
    default:
      return { icon: '⚠️', label: ui.settings.glossaryModelStateAbsent, tone: 'text-gray-400' };
  }
}

/**
 * Semantic matching model card (design §2.11.3).
 *
 * Shows the model state, the runtime backend and — when relevant — download /
 * install / verify / export actions. Nothing here blocks the rest of the
 * settings page: a missing or broken model only disables the semantic layer.
 */
export const GlossaryModelCard: React.FC = () => {
  const store = useMappingStore();
  const settings = store.glossarySettings;
  const status = store.glossaryStatus?.model ?? null;
  const embedding = store.glossaryEmbeddingProgress;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Live progress pushes from the main process.
  useEffect(() => {
    const offModel = glossaryApi.onModelProgress((progress: GlossaryModelProgress) => {
      store.setGlossaryModelProgress(progress);
    });
    const offEmbedding = glossaryApi.onEmbeddingProgress((progress) => {
      store.setGlossaryEmbeddingProgress(progress);
    });
    const offStatus = glossaryApi.onStatusChanged((next) => {
      store.setGlossaryStatus(next);
    });
    return () => {
      offModel();
      offEmbedding();
      offStatus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings || !status) return null;

  const badge = statusBadge(status);
  const progress = embedding ?? {
    done: store.glossaryStatus?.embedded ?? 0,
    total: store.glossaryStatus?.embeddingTotal ?? 0,
    failed: 0,
    running: store.glossaryStatus?.embeddingRunning ?? false,
  };

  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: label });
    } catch (err) {
      setMessage({
        ok: false,
        text: formatUi(ui.settings.glossaryModelUnknownError, {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const changeRuntime = async (runtimeBackend: GlossaryRuntimeBackend): Promise<void> => {
    await run('', async () => {
      await store.saveGlossarySettings({ localEmbedding: { ...settings.localEmbedding, runtimeBackend } });
    });
  };

  const toggleEnabled = async (enabled: boolean): Promise<void> => {
    await run('', async () => {
      await store.saveGlossarySettings({ localEmbedding: { ...settings.localEmbedding, enabled } });
    });
  };

  const handleInstallPackage = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await store.installModelPackage();
      if (outcome.status === 'needs_confirm') {
        if (window.confirm(formatUi(ui.settings.glossaryModelNeedsConfirm, { model: outcome.modelId }))) {
          await store.confirmCustomModel();
        }
      }
    } catch (err) {
      setMessage({
        ok: false,
        text: formatUi(ui.settings.glossaryModelUnknownError, {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    await run('', async () => {
      const result = await store.exportModelPackage();
      if (result.status === 'exported' && result.path) {
        setMessage({ ok: true, text: formatUi(ui.settings.glossaryModelExported, { path: result.path }) });
      }
    });
  };

  const downloadPercent =
    store.glossaryModelProgress?.totalBytes && store.glossaryModelProgress.receivedBytes
      ? Math.min(
          100,
          Math.round(
            (store.glossaryModelProgress.receivedBytes / store.glossaryModelProgress.totalBytes) * 100
          )
        )
      : 0;

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">🧠 {ui.settings.glossaryModelTitle}</h3>
          <p className="text-[11px] text-gray-500 mt-1">{ui.settings.glossaryModelHint}</p>
        </div>
        <span className={`text-xs whitespace-nowrap ${badge.tone}`}>
          {badge.icon} {badge.label}
          {status.custom ? ` · ${ui.settings.glossaryModelCustom}` : ''}
        </span>
      </div>

      {/* Runtime + options */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-300">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.localEmbedding.enabled}
            onChange={(e) => void toggleEnabled(e.target.checked)}
            className="accent-blue-500"
          />
          {ui.settings.glossaryModelEnable}
        </label>
        <label className="flex items-center gap-2">
          {ui.settings.glossaryModelRuntime}
          <select
            value={settings.localEmbedding.runtimeBackend}
            onChange={(e) => void changeRuntime(e.target.value as GlossaryRuntimeBackend)}
            className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
          >
            <option value="auto">{ui.settings.glossaryModelRuntimeAuto}</option>
            <option value="native">{ui.settings.glossaryModelRuntimeNative}</option>
            <option value="wasm">{ui.settings.glossaryModelRuntimeWasm}</option>
          </select>
        </label>
        <span className="text-gray-400">
          {status.backend === 'native'
            ? ui.settings.glossaryModelBackendNative
            : status.backend === 'wasm'
              ? ui.settings.glossaryModelBackendWasm
              : ui.settings.glossaryModelBackendNone}
        </span>
        {status.dims ? (
          <span className="text-gray-500">
            {formatUi(ui.settings.glossaryModelDims, { dims: status.dims })}
          </span>
        ) : null}
      </div>

      {status.compatibility && status.nativeFailedAt ? (
        <p className="text-[11px] text-amber-400">
          {formatUi(ui.settings.glossaryModelNativeFailed, { reason: status.reason ?? 'runtime_load' })}{' '}
          <button
            onClick={() => void run('', () => store.retryNativeBackend())}
            className="underline hover:text-amber-300"
          >
            {ui.settings.glossaryModelRetryNative}
          </button>
        </p>
      ) : null}

      {status.reason ? <p className="text-[11px] text-red-400">{status.reason}</p> : null}

      {/* Install actions */}
      <div className="flex flex-wrap gap-2">
        {status.state !== 'ready' && status.state !== 'downloading' ? (
          <button
            disabled={busy}
            onClick={() => void run('', () => store.downloadModel())}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded"
          >
            ⬇️ {ui.settings.glossaryModelDownload}
          </button>
        ) : null}
        {status.state === 'downloading' ? (
          <button
            disabled={busy}
            onClick={() => void run('', () => store.cancelModelDownload())}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-100 text-xs rounded"
          >
            ✖ {ui.settings.glossaryModelCancel}
          </button>
        ) : null}
        <button
          disabled={busy}
          onClick={() => void handleInstallPackage()}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-xs rounded"
        >
          📦 {ui.settings.glossaryModelInstallPackage}
        </button>
        <button
          disabled={busy}
          onClick={() => void run('', async () => void (await store.installModelFolder()))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-xs rounded"
        >
          📁 {ui.settings.glossaryModelInstallFolder}
        </button>
      </div>
      <p className="text-[11px] text-gray-500">{ui.settings.glossaryModelHowToGet}</p>

      {/* Installed actions */}
      {status.installed ? (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => void handleExport()}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-xs rounded"
          >
            📤 {ui.settings.glossaryModelExport}
          </button>
          <button
            disabled={busy}
            onClick={() => void run('', () => store.verifyModel())}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-xs rounded"
          >
            🔍 {ui.settings.glossaryModelVerify}
          </button>
          <button
            disabled={busy}
            onClick={() => void run('', () => store.retryModel())}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-xs rounded"
          >
            ↻ {ui.settings.glossaryModelRetry}
          </button>
          <button
            disabled={busy}
            onClick={() => void run('', () => store.removeModel())}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs rounded"
          >
            🗑 {ui.settings.glossaryModelRemove}
          </button>
        </div>
      ) : null}

      {/* Vector indexing progress */}
      {progress.total > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>
              {formatUi(ui.settings.glossaryModelEmbedding, {
                done: progress.done,
                total: progress.total,
              })}
              {progress.running ? '' : ui.settings.glossaryModelEmbeddingPaused}
            </span>
            <button
              disabled={busy}
              onClick={() => void run('', () =>
                progress.running ? store.pauseEmbedding() : store.startEmbedding()
              )}
              className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {progress.running ? ui.settings.glossaryModelPauseIndexing : ui.settings.glossaryModelStartIndexing}
            </button>
          </div>
          <div className="h-1.5 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, Math.round((progress.done / Math.max(1, progress.total)) * 100))}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Download progress */}
      {store.glossaryModelProgress?.phase === 'download' ? (
        <div className="space-y-1">
          <div className="text-[11px] text-gray-400">
            {formatUi(ui.settings.glossaryModelDownloadProgress, {
              file: store.glossaryModelProgress.file ?? '',
              percent: downloadPercent,
            })}
          </div>
          <div className="h-1.5 bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${downloadPercent}%` }} />
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-[11px] ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
      ) : null}
    </section>
  );
};
