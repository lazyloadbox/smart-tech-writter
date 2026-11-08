import React, { useEffect, useMemo, useState } from 'react';
import type { GlossaryEntryView, GlossaryHit } from '../../../../shared/types/glossary.types';
import { en as ui, formatUi } from '../../../../shared/i18n';
import { glossaryApi } from '../../../api/glossary.api';

interface GlossaryAppliedNoticeProps {
  /** Hits resolved for this run (`DocGenState.glossaryHits`). */
  hits: GlossaryHit[];
  /** Project-level switch (`DocGenState.useGlossary`); `false` renders an "off" note. */
  enabled?: boolean;
  /** `banner` = compact collapsible strip; `panel` = card with the list expanded. */
  variant?: 'banner' | 'panel';
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Read-only summary of the glossary entries that were injected into the AI
 * prompts for the current document (generation + review stages).
 *
 * Unlike `GlossaryHitsPanel` (the `review_analyze` confirmation UI) this
 * component never mutates the hits — it only tells the user *whether* and
 * *which* approved terminology the generated content was based on.
 */
export const GlossaryAppliedNotice: React.FC<GlossaryAppliedNoticeProps> = ({
  hits,
  enabled = true,
  variant = 'banner',
  defaultExpanded = false,
  className = '',
}) => {
  const [entries, setEntries] = useState<Record<string, GlossaryEntryView>>({});
  const [expanded, setExpanded] = useState(defaultExpanded || variant === 'panel');

  const activeHits = useMemo(() => hits.filter((hit) => hit.userState !== 'removed'), [hits]);
  const ids = useMemo(() => activeHits.map((hit) => hit.entryId), [activeHits]);
  const idKey = ids.join('|');

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
        /* keep whatever we already have */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const tierA = activeHits.filter((hit) => hit.tier === 'A').length;
  const tierB = activeHits.length - tierA;

  const hasHits = enabled && activeHits.length > 0;
  const summary = !enabled
    ? ui.docGenerator.glossaryAppliedOff
    : activeHits.length === 0
      ? ui.docGenerator.glossaryAppliedNone
      : formatUi(ui.docGenerator.glossaryAppliedCount, {
          count: activeHits.length,
          tierA,
          tierB,
        });

  const tone = hasHits
    ? 'border-green-800/50 bg-green-950/20 text-green-200'
    : 'border-gray-700 bg-gray-800/60 text-gray-400';

  const list = (
    <div className="mt-1.5 space-y-1">
      <p className="text-[11px] text-gray-400">{ui.docGenerator.glossaryAppliedHint}</p>
      <ul className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
        {activeHits.map((hit) => {
          const entry = entries[hit.entryId];
          return (
            <li
              key={hit.entryId}
              className="flex items-baseline gap-1.5 px-2 py-1 rounded bg-gray-900/60 border border-gray-700/60 text-[11px]"
            >
              <span
                className={`shrink-0 px-1 py-0.5 rounded border text-[9px] ${
                  hit.tier === 'A'
                    ? 'bg-green-900/50 text-green-300 border-green-800/50'
                    : 'bg-amber-900/50 text-amber-300 border-amber-800/50'
                }`}
              >
                {hit.tier === 'A' ? ui.docGenerator.glossaryTierA : ui.docGenerator.glossaryTierB}
              </span>
              <span className="text-gray-200 font-medium truncate">
                {entry ? entry.en || entry.zhCN : hit.entryId}
              </span>
              {entry?.zhCN && <span className="text-gray-400 truncate">· {entry.zhCN}</span>}
              {hit.userState === 'confirmed' && <span className="text-green-400">✓</span>}
              {hit.userState === 'added' && <span className="text-blue-300">+</span>}
              <span className="ml-auto shrink-0 text-gray-500">
                {hit.layers.map((layer) => ui.docGenerator.glossaryLayerLabels[layer] ?? layer).join(' · ')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className={`rounded border px-3 py-2 text-xs ${tone} ${className}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium">📚 {ui.docGenerator.glossaryAppliedTitle}</span>
        <span className="opacity-90">{summary}</span>
        {hasHits && variant === 'banner' && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="ml-auto px-1.5 py-0.5 rounded border border-gray-600/70 text-[10px] opacity-80 hover:opacity-100"
          >
            {expanded ? '▾' : '▸'} {expanded ? ui.docGenerator.glossaryAppliedHide : ui.docGenerator.glossaryAppliedShow}
          </button>
        )}
      </div>
      {(variant === 'panel' ? hasHits : hasHits && expanded) && list}
    </div>
  );
};
