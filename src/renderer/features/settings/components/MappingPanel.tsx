import React, { useEffect, useState } from 'react';
import { useMappingStore } from '../../../stores/mapping.store';
import { MappingImportModal } from './MappingImportModal';
import { GlossaryModelCard } from './GlossaryModelCard';
import type {
  GlossaryEntryKind,
  MappingImportParseResult,
  MappingImportPlanResult,
  MappingImportResult,
  TranslationMapping,
} from '../../../../shared/types/mapping.types';
import type { MappingImportOptionsPayload } from '../../../../shared/types/ipc.types';
import type { GlossaryMatchScenario } from '../../../../shared/types/glossary.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface EditState {
  id: string;
  en: string;
  zhCN: string;
  zhTW: string;
  /** Newline / `;` separated "do not use" wordings (P4-6). */
  doNotUse: string;
}

/** Split the free-form "do not use" input into individual wordings. */
function parseDoNotUseInput(value: string): string[] {
  return value
    .split(/[\n;|、]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Human label for an entry kind. */
function kindLabel(kind: GlossaryEntryKind): string {
  return kind === 'term' ? ui.settings.kindTerm : ui.settings.kindPhrase;
}

/** Human label for an entry origin. */
function originLabel(mapping: TranslationMapping): string {
  if (mapping.origin === 'default') return ui.settings.originDefault;
  if (mapping.origin === 'import') return ui.settings.originImport;
  return ui.settings.originManual;
}

/**
 * Translation glossary management panel.
 *
 * Maintains English / Simplified Chinese / Taiwan Traditional Chinese
 * terminology in local SQLite storage. Supports search, kind filter,
 * server-side pagination, inline editing, Excel/CSV plan-based import
 * (append / replace) and Excel export.
 */
export const MappingPanel: React.FC = () => {
  const store = useMappingStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addEn, setAddEn] = useState('');
  const [addZhCN, setAddZhCN] = useState('');
  const [addZhTW, setAddZhTW] = useState('');
  const [addDoNotUse, setAddDoNotUse] = useState('');
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editMsg, setEditMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importResult, setImportResult] = useState<MappingImportParseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPlayground, setShowPlayground] = useState(false);
  const [playgroundText, setPlaygroundText] = useState('');
  const [playgroundScenario, setPlaygroundScenario] = useState<GlossaryMatchScenario>('writing');
  const [playgroundTarget, setPlaygroundTarget] = useState<'en' | 'zh-CN' | 'zh-TW'>('zh-CN');
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!store.loaded) store.load();
    if (!store.glossarySettings) store.loadGlossary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = store.stats;
  const glossarySettings = store.glossarySettings;
  const glossaryStatus = store.glossaryStatus;
  const totalPages = Math.max(1, Math.ceil(store.total / store.pageSize));
  const page = Math.min(store.page, totalPages);

  const handleAdd = async () => {
    if (!addEn.trim()) {
      setAddMsg({ ok: false, text: ui.settings.englishRequired });
      return;
    }
    const created = await store.add(addEn, addZhCN, addZhTW, undefined, parseDoNotUseInput(addDoNotUse));
    if (created) {
      setAddMsg({ ok: true, text: `✅ ${ui.settings.glossaryAdded}` });
      setAddEn('');
      setAddZhCN('');
      setAddZhTW('');
      setAddDoNotUse('');
    } else {
      setAddMsg({ ok: false, text: ui.settings.duplicateGlossary });
    }
    setTimeout(() => setAddMsg(null), 2500);
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!editing.en.trim()) {
      setEditMsg({ ok: false, text: ui.settings.englishRequired });
      return;
    }
    const updated = await store.update(
      editing.id,
      editing.en,
      editing.zhCN,
      editing.zhTW,
      undefined,
      parseDoNotUseInput(editing.doNotUse)
    );
    if (updated) {
      setEditMsg({ ok: true, text: `✅ ${ui.settings.glossarySaved}` });
      setEditing(null);
    } else {
      setEditMsg({ ok: false, text: ui.settings.glossarySaveFailed });
    }
    setTimeout(() => setEditMsg(null), 2500);
  };

  const handleImportParse = async () => {
    setImportError(null);
    try {
      const result = await store.importParse();
      if (result) setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReplan = async (payload: MappingImportOptionsPayload): Promise<MappingImportPlanResult> => {
    return store.importPlan(payload);
  };

  const handleImport = async (payload: MappingImportOptionsPayload): Promise<MappingImportResult> => {
    return store.importMappings(payload);
  };

  const handleExport = async () => {
    setExportMsg(null);
    try {
      const filePath = await store.exportMappings();
      if (filePath) {
        setExportMsg({ ok: true, text: formatUi(ui.settings.exportGlossaryDone, { path: filePath }) });
      }
    } catch (err) {
      setExportMsg({
        ok: false,
        text: formatUi(ui.settings.exportGlossaryFailed, {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
    setTimeout(() => setExportMsg(null), 4000);
  };

  const toggleScope = async (key: 'useInWriter' | 'useInTranslation' | 'useInReview' | 'ruleCheck', value: boolean) => {
    await store.saveGlossarySettings({ [key]: value });
  };

  /** P4-1 / P4-2: load backups + import batches. */
  const handleOpenMaintenance = async () => {
    setShowMaintenance(true);
    setMaintenanceMsg(null);
    await Promise.all([store.loadBackups(), store.loadBatches()]);
  };

  /** P4-1: restore a backup file (the current table is backed up first). */
  const handleRestoreBackup = async (fileName: string, rows: number) => {
    if (
      !window.confirm(
        formatUi(ui.settings.restoreBackupConfirm, { fileName, rows })
      )
    ) {
      return;
    }
    try {
      const restored = await store.restoreBackup(fileName);
      setMaintenanceMsg({
        ok: true,
        text: formatUi(ui.settings.restoreBackupDone, { count: restored }),
      });
    } catch (err) {
      setMaintenanceMsg({
        ok: false,
        text: formatUi(ui.settings.restoreBackupFailed, {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  };

  /** P4-2: undo one import batch. */
  const handleUndoBatch = async (batchId: string, fileName: string) => {
    if (!window.confirm(formatUi(ui.settings.undoBatchConfirm, { fileName }))) return;
    try {
      const result = await store.undoBatch(batchId);
      setMaintenanceMsg({
        ok: true,
        text: formatUi(ui.settings.undoBatchDone, {
          removed: result.removed,
          restored: result.restored,
        }),
      });
    } catch (err) {
      setMaintenanceMsg({
        ok: false,
        text: formatUi(ui.settings.undoBatchFailed, {
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  };

  const handlePlayground = async () => {
    if (!playgroundText.trim()) return;
    setPlaygroundError(null);
    try {
      await store.runGlossaryTest({
        text: playgroundText,
        scenario: playgroundScenario,
        targetLang: playgroundScenario === 'translation' ? playgroundTarget : undefined,
      });
    } catch (err) {
      setPlaygroundError(
        formatUi(ui.settings.glossaryTestFailed, {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">{ui.settings.mappingTitle}</h2>
          <p className="text-xs text-gray-500 mt-1">{ui.settings.mappingPanelDescription}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm rounded transition-colors"
          >
            📤 {ui.settings.exportGlossary}
          </button>
          <button
            onClick={handleImportParse}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            📥 {ui.settings.importGlossary}
          </button>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300">
            {formatUi(ui.settings.glossaryTotal, { count: stats.total })}
          </span>
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400">
            {ui.settings.kindTerm} · {stats.terms}
          </span>
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400">
            {ui.settings.kindPhrase} · {stats.phrases}
          </span>
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400">
            {formatUi(ui.settings.glossaryComplete, { count: stats.complete })}
          </span>
          {stats.missingZhTw > 0 && (
            <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-amber-400">
              zh-TW — · {stats.missingZhTw}
            </span>
          )}
        </div>
      )}

      {/* Matching engine: usage scope + index status (P2a) */}
      {glossarySettings && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">⚙️ {ui.settings.glossaryEngineTitle}</h3>
              <p className="text-[11px] text-gray-500 mt-1">{ui.settings.glossaryEngineHint}</p>
            </div>
            {glossaryStatus && (
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {formatUi(ui.settings.glossaryStatusLine, {
                  entries: glossaryStatus.entries,
                  version: glossaryStatus.version,
                  engine: glossaryStatus.engine.toUpperCase(),
                  worker:
                    glossaryStatus.worker === 'worker'
                      ? ui.settings.glossaryWorker
                      : ui.settings.glossaryWorkerInline,
                  state: glossaryStatus.indexReady
                    ? ui.settings.glossaryStateReady
                    : ui.settings.glossaryStatePending,
                })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ['useInWriter', ui.settings.glossaryScopeWriter],
                ['useInTranslation', ui.settings.glossaryScopeTranslation],
                ['useInReview', ui.settings.glossaryScopeReview],
                ['ruleCheck', ui.settings.glossaryScopeRules],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={glossarySettings[key]}
                  onChange={(e) => void toggleScope(key, e.target.checked)}
                  className="accent-blue-500"
                />
                {label}
              </label>
            ))}
          </div>
          {/* P4 advanced switches */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-700/60">
            {(
              [
                ['analyzeInjection', ui.settings.glossaryScopeAnalyze],
                ['forbiddenCheck', ui.settings.glossaryScopeForbidden],
                ['vectorSnapshot', ui.settings.glossaryScopeSnapshot],
                ['writerToolLookup', ui.settings.glossaryScopeTool],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={glossarySettings[key]}
                  onChange={(e) => void store.saveGlossarySettings({ [key]: e.target.checked })}
                  className="accent-blue-500"
                />
                {label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Semantic matching model (P2b) */}
      <GlossaryModelCard />

      {/* Matching playground (P2a) */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">🧪 {ui.settings.glossaryPlayground}</h3>
          <button
            onClick={() => setShowPlayground((v) => !v)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showPlayground ? ui.settings.collapse : ui.settings.expand}
          </button>
        </div>
        {showPlayground && (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500">{ui.settings.glossaryPlaygroundHint}</p>
            <textarea
              value={playgroundText}
              onChange={(e) => setPlaygroundText(e.target.value)}
              rows={4}
              placeholder={ui.settings.glossaryPlaygroundPlaceholder}
              className="w-full px-2.5 py-2 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 resize-y"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-400">
                {ui.settings.glossaryScenario}
                <select
                  value={playgroundScenario}
                  onChange={(e) => setPlaygroundScenario(e.target.value as GlossaryMatchScenario)}
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
                >
                  <option value="writing">{ui.settings.glossaryScenarioWriting}</option>
                  <option value="translation">{ui.settings.glossaryScenarioTranslation}</option>
                  <option value="review">{ui.settings.glossaryScenarioReview}</option>
                </select>
              </label>
              {playgroundScenario === 'translation' && (
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  {ui.settings.glossaryTargetLanguage}
                  <select
                    value={playgroundTarget}
                    onChange={(e) => setPlaygroundTarget(e.target.value as 'en' | 'zh-CN' | 'zh-TW')}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
                  >
                    <option value="zh-CN">zh-CN</option>
                    <option value="zh-TW">zh-TW</option>
                    <option value="en">en</option>
                  </select>
                </label>
              )}
              <button
                onClick={handlePlayground}
                disabled={store.glossaryTestRunning || !playgroundText.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white text-xs rounded transition-colors"
              >
                {store.glossaryTestRunning ? ui.settings.glossaryMatching : ui.settings.glossaryRunMatch}
              </button>
              {playgroundError && <span className="text-[11px] text-red-400">{playgroundError}</span>}
            </div>

            {store.glossaryTest && (
              <div className="space-y-2">
                <div className="text-[11px] text-gray-400">
                  {formatUi(ui.settings.glossaryHitCount, {
                    count: store.glossaryTest.hits.length,
                    tokens: store.glossaryTest.tokens,
                    elapsed: store.glossaryTest.elapsedMs,
                  })}
                  {store.glossaryTest.truncated > 0 && (
                    <span className="text-amber-400 ml-2">
                      {formatUi(ui.settings.glossaryTruncated, { count: store.glossaryTest.truncated })}
                    </span>
                  )}
                </div>

                {store.glossaryTest.hits.length === 0 ? (
                  <div className="text-xs text-gray-500">{ui.settings.glossaryNoHits}</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-gray-700 rounded divide-y divide-gray-700/60">
                    {store.glossaryTest.hits.map((hit) => {
                      const entry = store.glossaryTest?.entries[hit.entryId];
                      return (
                        <div key={hit.entryId} className="px-3 py-1.5 text-xs flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              hit.tier === 'A'
                                ? 'bg-green-700/60 text-green-200'
                                : 'bg-gray-600 text-gray-300'
                            }`}
                          >
                            {hit.tier === 'A' ? ui.settings.glossaryTierA : ui.settings.glossaryTierB}
                          </span>
                          <span className="text-gray-200">{entry?.en ?? hit.entryId}</span>
                          <span className="text-gray-500">→</span>
                          <span className="text-gray-400">{entry?.zhCN || entry?.zhTW || '—'}</span>
                          <span className="ml-auto text-[10px] text-gray-500">
                            {hit.layers.join(' · ')} · {hit.score.toFixed(2)} ×{hit.hits}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {store.glossaryTest.block && (
                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer select-none">{ui.settings.glossaryPromptBlock}</summary>
                    <pre className="mt-2 p-2 bg-gray-900 border border-gray-700 rounded text-[11px] text-gray-300 overflow-x-auto whitespace-pre-wrap">
                      {store.glossaryTest.block}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Add term */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">➕ {ui.settings.addMapping}</h3>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showAdd ? ui.settings.collapse : ui.settings.expand}
          </button>
        </div>
        {showAdd && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">{ui.settings.english}</label>
                <textarea
                  value={addEn}
                  onChange={(e) => setAddEn(e.target.value)}
                  rows={2}
                  placeholder={ui.settings.englishTermPlaceholder}
                  className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{ui.settings.zhCnOptional}</label>
                <textarea
                  value={addZhCN}
                  onChange={(e) => setAddZhCN(e.target.value)}
                  rows={2}
                  placeholder={ui.settings.simplifiedChineseTermPlaceholder}
                  className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{ui.settings.zhTwOptional}</label>
                <textarea
                  value={addZhTW}
                  onChange={(e) => setAddZhTW(e.target.value)}
                  rows={2}
                  placeholder={ui.settings.traditionalChineseTermPlaceholder}
                  className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">⛔ {ui.settings.doNotUseOptional}</label>
                <textarea
                  value={addDoNotUse}
                  onChange={(e) => setAddDoNotUse(e.target.value)}
                  rows={2}
                  placeholder={ui.settings.doNotUsePlaceholder}
                  className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
              >
                {ui.settings.add}
              </button>
              {addMsg && (
                <span className={`text-xs ${addMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{addMsg.text}</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Search and list */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-300">🔍 {ui.common.search}</span>
          <input
            value={store.search}
            onChange={(e) => store.setSearch(e.target.value)}
            placeholder={ui.settings.glossarySearchPlaceholder}
            className="px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 w-64"
          />
          <select
            value={store.kind}
            onChange={(e) => store.setKind(e.target.value as GlossaryEntryKind | '')}
            className="px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
          >
            <option value="">{ui.settings.allKinds}</option>
            <option value="term">{ui.settings.kindTerm}</option>
            <option value="phrase">{ui.settings.kindPhrase}</option>
          </select>
          <span className="text-xs text-gray-500">
            {formatUi(ui.settings.glossarySearchCount, { count: store.total })}
          </span>
        </div>

        {/* Glossary list */}
        <div className="mt-3 border border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-700/60 text-gray-300">
                <th className="px-2 py-2 text-left font-medium w-12">{ui.settings.glossaryNo}</th>
                <th className="px-3 py-2 text-left font-medium">{ui.settings.english}</th>
                <th className="px-3 py-2 text-left font-medium">{ui.settings.simplifiedChinese}</th>
                <th className="px-3 py-2 text-left font-medium">{ui.settings.traditionalChinese}</th>
                <th className="px-3 py-2 text-left font-medium">⛔ {ui.settings.doNotUse}</th>
                <th className="px-2 py-2 text-left font-medium w-16">{ui.settings.glossaryKind}</th>
                <th className="px-2 py-2 text-left font-medium w-20">{ui.settings.glossaryOrigin}</th>
                <th className="px-2 py-2 text-right font-medium w-24">{ui.settings.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {store.mappings.map((m) => (
                <tr key={m.id} className="text-gray-300 hover:bg-gray-700/30">
                  {editing?.id === m.id ? (
                    <>
                      <td className="px-2 py-2 text-gray-500">{m.seqNo ?? '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          value={editing.en}
                          onChange={(e) => setEditing({ ...editing, en: e.target.value })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editing.zhCN}
                          onChange={(e) => setEditing({ ...editing, zhCN: e.target.value })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editing.zhTW}
                          onChange={(e) => setEditing({ ...editing, zhTW: e.target.value })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editing.doNotUse}
                          onChange={(e) => setEditing({ ...editing, doNotUse: e.target.value })}
                          placeholder={ui.settings.doNotUsePlaceholder}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-500">{kindLabel(m.kind)}</td>
                      <td className="px-2 py-2 text-gray-500">{originLabel(m)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={handleEdit}                          className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded mr-1"
                        >
                          {ui.common.save}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 text-[10px] rounded"
                        >
                          {ui.common.cancel}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-gray-500">{m.seqNo ?? '—'}</td>
                      <td className="px-3 py-2 break-all">{m.en}</td>
                      <td className="px-3 py-2 break-all">{m.zhCN || <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2 break-all">{m.zhTW || <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2 break-all text-amber-300/80">
                        {(m.doNotUse ?? []).length > 0 ? (m.doNotUse ?? []).join(', ') : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-2 py-2 text-gray-400">{kindLabel(m.kind)}</td>
                      <td className="px-2 py-2 text-gray-500">{originLabel(m)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() =>
                            setEditing({
                              id: m.id,
                              en: m.en,
                              zhCN: m.zhCN,
                              zhTW: m.zhTW,
                              doNotUse: (m.doNotUse ?? []).join('; '),
                            })
                          }
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 text-[10px] rounded mr-1"
                        >
                          {ui.common.edit}
                        </button>
                        <button
                          onClick={() => store.remove(m.id)}
                          className="px-2 py-1 bg-red-700/70 hover:bg-red-600 text-gray-200 text-[10px] rounded"
                        >
                          {ui.common.delete}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {store.mappings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                    {ui.settings.noMappings}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {store.total > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-500">
              {formatUi(ui.settings.paginationSummary, {
                count: store.total,
                page,
                total: totalPages,
              })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => store.setPage(page - 1)}
                disabled={page <= 1}
                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-xs rounded transition-colors"
              >
                ‹ {ui.settings.previousPage}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<React.ReactNode[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                    acc.push(
                      <span key={`gap-${p}`} className="px-1 text-xs text-gray-500 select-none">
                        …
                      </span>
                    );
                  }
                  acc.push(
                    <button
                      key={p}
                      onClick={() => store.setPage(p)}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        p === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      {p}
                    </button>
                  );
                  return acc;
                }, [])}
              <button
                onClick={() => store.setPage(page + 1)}
                disabled={page >= totalPages}
                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-xs rounded transition-colors"
              >
                {ui.settings.nextPage} ›
              </button>
            </div>
          </div>
        )}

        {editMsg && (
          <p className={`mt-2 text-xs ${editMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{editMsg.text}</p>
        )}
        {exportMsg && (
          <p className={`mt-2 text-xs break-all ${exportMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {exportMsg.text}
          </p>
        )}
        {importError && (
          <p className="mt-2 text-xs text-red-400">
            {formatUi(ui.settings.glossaryImportFailed, { error: importError })}
          </p>
        )}
      </section>

      {/* Backups + import batches (P4-1 / P4-2) */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-gray-200">🗂 {ui.settings.maintenanceTitle}</h3>
            <p className="text-xs text-gray-500 mt-1">{ui.settings.maintenanceDescription}</p>
          </div>
          <button
            onClick={handleOpenMaintenance}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-100 text-xs rounded transition-colors shrink-0"
          >
            {showMaintenance ? ui.settings.maintenanceRefresh : ui.settings.maintenanceOpen}
          </button>
        </div>

        {showMaintenance && (
          <div className="mt-3 space-y-4">
            {maintenanceMsg && (
              <p className={`text-xs ${maintenanceMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                {maintenanceMsg.text}
              </p>
            )}

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">
                💾 {formatUi(ui.settings.backupListTitle, { count: store.backups.length })}
              </h4>
              <div className="border border-gray-700 rounded overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-700/60">
                    {store.backups.map((backup) => (
                      <tr key={backup.path} className="text-gray-300 hover:bg-gray-700/30">
                        <td className="px-3 py-2 break-all">{backup.fileName}</td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                          {backup.createdAt.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="px-2 py-2 text-gray-400 whitespace-nowrap">
                          {formatUi(ui.settings.backupRowCount, { count: backup.rows })}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => handleRestoreBackup(backup.fileName, backup.rows)}
                            className="px-2 py-1 bg-amber-700/70 hover:bg-amber-600 text-white text-[10px] rounded"
                          >
                            {ui.settings.restoreBackup}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {store.backups.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-center text-gray-500">{ui.settings.noBackups}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">
                📦 {formatUi(ui.settings.batchListTitle, { count: store.batches.length })}
              </h4>
              <div className="border border-gray-700 rounded overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-700/60">
                    {store.batches.map((batch) => (
                      <tr key={batch.id} className="text-gray-300 hover:bg-gray-700/30">
                        <td className="px-3 py-2 break-all">{batch.fileName}</td>
                        <td className="px-2 py-2 text-gray-400 whitespace-nowrap">
                          {batch.mode === 'replace' ? ui.settings.importModeReplace : ui.settings.importModeAppend}
                        </td>
                        <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                          {batch.createdAt.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="px-2 py-2 text-gray-400 whitespace-nowrap">
                          {batch.stats
                            ? formatUi(ui.settings.batchStats, {
                                inserted: batch.stats.toInsert,
                                updated: batch.stats.toUpdate,
                              })
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {batch.undoable ? (
                            <button
                              onClick={() => handleUndoBatch(batch.id, batch.fileName)}
                              className="px-2 py-1 bg-red-700/70 hover:bg-red-600 text-gray-200 text-[10px] rounded"
                            >
                              {ui.settings.undoBatch}
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-500">{ui.settings.batchUndone}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {store.batches.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-center text-gray-500">{ui.settings.noBatches}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Import dialog */}
      {importResult && (
        <MappingImportModal
          parseResult={importResult}
          onClose={() => setImportResult(null)}
          onReplan={handleReplan}
          onImport={handleImport}
        />
      )}
    </div>
  );
};
