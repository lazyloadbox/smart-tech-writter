import React, { useEffect, useState } from 'react';
import { useMappingStore } from '../../../stores/mapping.store';
import { MappingImportModal } from './MappingImportModal';
import type { MappingImportParseResult } from '../../../../shared/types/mapping.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface EditState {
  id: string;
  en: string;
  zhCN: string;
  zhTW: string;
}

/** Number of glossary entries shown per page. */
const PAGE_SIZE = 20;

/**
 * Translation glossary management panel.
 *
 * Maintains English, Simplified Chinese, and Taiwan Traditional Chinese
 * terminology in local SQLite storage. Supports search, pagination, editing,
 * deletion, and Excel/CSV import.
 */
export const MappingPanel: React.FC = () => {
  const store = useMappingStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addEn, setAddEn] = useState('');
  const [addZhCN, setAddZhCN] = useState('');
  const [addZhTW, setAddZhTW] = useState('');
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editMsg, setEditMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importResult, setImportResult] = useState<MappingImportParseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!store.loaded) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return to the first page when search/data changes and clamp after deletion.
  useEffect(() => {
    setPage(1);
  }, [store.search]);
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(store.mappings.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [store.mappings.length, page]);

  const totalPages = Math.max(1, Math.ceil(store.mappings.length / PAGE_SIZE));
  const pageMappings = store.mappings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const handleAdd = async () => {
    if (!addEn.trim() || !addZhCN.trim() || !addZhTW.trim()) {
      setAddMsg({ ok: false, text: ui.settings.allGlossaryFieldsRequired });
      return;
    }
    const created = await store.add(addEn, addZhCN, addZhTW);
    if (created) {
      setAddMsg({ ok: true, text: `✅ ${ui.settings.glossaryAdded}` });
      setAddEn('');
      setAddZhCN('');
      setAddZhTW('');
    } else {
      setAddMsg({ ok: false, text: ui.settings.duplicateGlossary });
    }
    setTimeout(() => setAddMsg(null), 2500);
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!editing.en.trim() || !editing.zhCN.trim() || !editing.zhTW.trim()) {
      setEditMsg({ ok: false, text: ui.settings.allGlossaryFieldsRequired });
      return;
    }
    const updated = await store.update(editing.id, editing.en, editing.zhCN, editing.zhTW);
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

  const handleImport = async () => {
    if (!importResult) throw new Error('no parse result');
    return store.importRows(importResult.rows);
  };

  const stats = store.stats;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">{ui.settings.mappingTitle}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {ui.settings.mappingPanelDescription}
          </p>
        </div>
        <button
          onClick={handleImportParse}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors shrink-0"
        >
          📥 {ui.settings.importGlossary}
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300">
            {formatUi(ui.settings.glossaryTotal, { count: stats.total })}
          </span>
          <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400">
            {formatUi(ui.settings.glossaryComplete, { count: stats.complete })}
          </span>
        </div>
      )}

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
                <label className="block text-xs text-gray-400 mb-1">{ui.settings.simplifiedChinese}</label>
                <textarea
                  value={addZhCN}
                  onChange={(e) => setAddZhCN(e.target.value)}
                  rows={2}
                  placeholder={ui.settings.simplifiedChineseTermPlaceholder}
                  className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 placeholder-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{ui.settings.traditionalChinese}</label>
                <textarea
                  value={addZhTW}
                  onChange={(e) => setAddZhTW(e.target.value)}
                  rows={2}
                  placeholder={ui.settings.traditionalChineseTermPlaceholder}
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
          <span className="text-xs text-gray-500">{formatUi(ui.settings.glossarySearchCount, { count: store.mappings.length })}</span>
        </div>

        {/* Glossary list */}
        <div className="mt-3 border border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-700/60 text-gray-300">
                <th className="px-3 py-2 text-left font-medium w-1/3">{ui.settings.english}</th>
                <th className="px-3 py-2 text-left font-medium w-1/3">{ui.settings.simplifiedChinese}</th>
                <th className="px-3 py-2 text-left font-medium w-1/3">{ui.settings.traditionalChinese}</th>
                <th className="px-3 py-2 text-right font-medium w-24">{ui.settings.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {pageMappings.map((m) => (
                <tr key={m.id} className="text-gray-300 hover:bg-gray-700/30">
                  {editing?.id === m.id ? (
                    <>
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
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={handleEdit}
                          className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded mr-1"
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
                      <td className="px-3 py-2 break-all">{m.en}</td>
                      <td className="px-3 py-2 break-all">{m.zhCN}</td>
                      <td className="px-3 py-2 break-all">{m.zhTW}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing({ id: m.id, en: m.en, zhCN: m.zhCN, zhTW: m.zhTW })}
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
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                    {ui.settings.noMappings}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {store.mappings.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-500">
              {formatUi(ui.settings.paginationSummary, { count: store.mappings.length, page, total: totalPages })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
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
                      onClick={() => goToPage(p)}
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
                onClick={() => goToPage(page + 1)}
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
        {importError && (
          <p className="mt-2 text-xs text-red-400">{formatUi(ui.settings.glossaryImportFailed, { error: importError })}</p>
        )}
      </section>

      {/* Import dialog */}
      {importResult && (
        <MappingImportModal
          parseResult={importResult}
          onClose={() => setImportResult(null)}
          onImport={handleImport}
        />
      )}
    </div>
  );
};
