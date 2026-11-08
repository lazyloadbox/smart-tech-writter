import React, { useEffect, useMemo, useState } from 'react';
import type { GlossaryEntryView, GlossaryHit } from '../../../../shared/types/glossary.types';
import { en as ui, formatUi } from '../../../../shared/i18n';
import { glossaryApi } from '../../../api/glossary.api';

interface GlossaryHitsPanelProps {
  hits: GlossaryHit[];
  onChange: (hits: GlossaryHit[]) => void;
  /** Whether the semantic layer is available (shows a hint when disabled). */
  semanticEnabled?: boolean;
}

const LAYER_COLORS: Record<string, string> = {
  exact: 'bg-green-900/50 text-green-300 border-green-800/50',
  variant: 'bg-teal-900/50 text-teal-300 border-teal-800/50',
  alias: 'bg-cyan-900/50 text-cyan-300 border-cyan-800/50',
  fuzzy: 'bg-amber-900/50 text-amber-300 border-amber-800/50',
  semantic: 'bg-purple-900/50 text-purple-300 border-purple-800/50',
  ai: 'bg-indigo-900/50 text-indigo-300 border-indigo-800/50',
};

/**
 * 📚 Glossary hit confirmation panel for the `review_analyze` checkpoint
 * (design §2.5.12 / P3-2a).
 *
 * Users can uncheck a hit (removed), promote a Tier B hit to Tier A
 * (confirmed), or search the glossary and add a missing entry (added). The
 * resulting array is submitted with `reviewContinue`, and the writer/reviewer
 * only see hits whose `userState !== 'removed'`.
 */
export const GlossaryHitsPanel: React.FC<GlossaryHitsPanelProps> = ({ hits, onChange, semanticEnabled }) => {
  const [entries, setEntries] = useState<Record<string, GlossaryEntryView>>({});
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<GlossaryEntryView[]>([]);
  const [searching, setSearching] = useState(false);

  const ids = useMemo(() => hits.map((hit) => hit.entryId), [hits]);

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      setEntries({});
      return;
    }
    void glossaryApi
      .entries(ids)
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, GlossaryEntryView> = {};
        for (const entry of list) map[entry.id] = entry;
        setEntries(map);
      })
      .catch(() => {
        /* keep previous entries */
      });
    return () => {
      cancelled = true;
    };
  }, [ids.join('|')]);

  const update = (next: GlossaryHit[]) => onChange(next);

  const toggle = (hit: GlossaryHit) => {
    update(
      hits.map((candidate) =>
        candidate.entryId === hit.entryId
          ? { ...candidate, userState: candidate.userState === 'removed' ? undefined : 'removed' }
          : candidate
      )
    );
  };

  const promote = (hit: GlossaryHit) => {
    update(
      hits.map((candidate) =>
        candidate.entryId === hit.entryId
          ? { ...candidate, tier: 'A', userState: 'confirmed' }
          : candidate
      )
    );
  };

  const runSearch = async () => {
    const query = search.trim();
    if (!query) return;
    setSearching(true);
    try {
      const result = await window.electronAPI.mapping.list({ search: query, offset: 0, limit: 8 });
      const existing = new Set(ids);
      setSearchResults(
        result.items
          .filter((item) => !existing.has(item.id))
          .map((item) => ({
            id: item.id,
            en: item.en,
            zhCN: item.zhCN,
            zhTW: item.zhTW,
            kind: item.kind,
            specificity: 1,
          }))
      );
    } finally {
      setSearching(false);
    }
  };

  const add = (entry: GlossaryEntryView) => {
    update([
      ...hits,
      {
        entryId: entry.id,
        tier: 'A',
        score: 1,
        layers: ['exact'],
        hits: 1,
        samples: [],
        userState: 'added',
      },
    ]);
    setSearchResults((prev) => prev.filter((candidate) => candidate.id !== entry.id));
  };

  const activeCount = hits.filter((hit) => hit.userState !== 'removed').length;

  return (
    <div className="p-4 bg-gray-800 rounded border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-200">📚 {ui.docGenerator.glossaryHitsTitle}</span>
        <span className="text-xs text-gray-500">{formatUi(ui.docGenerator.glossaryCount, { count: activeCount })}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">{ui.docGenerator.glossaryHitsHint}</p>
      {semanticEnabled === false && (
        <p className="text-[11px] text-amber-400/80 mb-2">⚠ {ui.docGenerator.glossarySemanticOff}</p>
      )}

      {hits.length === 0 && (
        <p className="text-xs text-gray-500 py-3 text-center">{ui.docGenerator.glossaryHitsEmpty}</p>
      )}

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {hits.map((hit) => {
          const entry = entries[hit.entryId];
          const removed = hit.userState === 'removed';
          return (
            <div
              key={hit.entryId}
              className={`flex items-start gap-2 p-2 rounded border text-xs ${
                removed ? 'border-gray-700 bg-gray-900/40 opacity-60' : 'border-gray-600 bg-gray-900/60'
              }`}
            >
              <input
                type="checkbox"
                checked={!removed}
                onChange={() => toggle(hit)}
                className="mt-0.5"
                aria-label={`include ${entry?.en ?? hit.entryId}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                    hit.tier === 'A'
                      ? 'bg-green-900/50 text-green-300 border-green-800/50'
                      : 'bg-amber-900/50 text-amber-300 border-amber-800/50'
                  }`}>
                    {hit.tier === 'A' ? ui.docGenerator.glossaryTierA : ui.docGenerator.glossaryTierB}
                  </span>
                  <span className="text-gray-200 font-medium truncate">
                    {entry ? entry.en || entry.zhCN : hit.entryId}
                  </span>
                  {entry && entry.zhCN && <span className="text-gray-400 truncate">· {entry.zhCN}</span>}
                  {hit.userState === 'added' && (
                    <span className="text-[10px] text-blue-300">+ added</span>
                  )}
                  {hit.userState === 'confirmed' && (
                    <span className="text-[10px] text-green-300">✓ confirmed</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {hit.layers.map((layer) => (
                    <span
                      key={layer}
                      className={`px-1 py-0.5 rounded border text-[9px] ${LAYER_COLORS[layer] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}
                    >
                      {ui.docGenerator.glossaryLayerLabels[layer]}
                    </span>
                  ))}
                  {hit.samples[0]?.surface && (
                    <span className="text-[10px] text-gray-500 truncate">
                      {formatUi(ui.docGenerator.glossarySource, { text: hit.samples[0].surface })}
                    </span>
                  )}
                </div>
              </div>
              {hit.tier === 'B' && !removed && (
                <button
                  onClick={() => promote(hit)}
                  className="shrink-0 px-2 py-1 bg-green-700/50 hover:bg-green-700 text-green-200 text-[10px] rounded transition-colors"
                >
                  {ui.docGenerator.glossaryPromote}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch();
          }}
          placeholder={ui.docGenerator.glossaryAddPlaceholder}
          className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 outline-none"
        />
        <button
          onClick={() => void runSearch()}
          disabled={searching}
          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs rounded transition-colors"
        >
          {searching ? '…' : ui.docGenerator.glossaryAdd}
        </button>
      </div>
      {searchResults.length > 0 && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {searchResults.map((entry) => (
            <button
              key={entry.id}
              onClick={() => add(entry)}
              className="w-full text-left px-2 py-1 bg-gray-900/70 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-200"
            >
              {entry.en}
              {entry.zhCN ? <span className="text-gray-400"> · {entry.zhCN}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
