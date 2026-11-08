import React, { useEffect, useRef, useState } from 'react';
import type {
  GlossaryColumnMap,
  GlossaryImportMode,
  ConflictStrategy,
  ImportPlan,
  ImportRowIssue,
  MappingImportParseResult,
  MappingImportPlanResult,
  MappingImportResult,
  ParsedGlossaryRow,
} from '../../../../shared/types/mapping.types';
import type { MappingImportOptionsPayload } from '../../../../shared/types/ipc.types';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface MappingImportModalProps {
  parseResult: MappingImportParseResult;
  onClose: () => void;
  /** Recompute the plan when the user changes mode / strategy / sheet. */
  onReplan: (payload: MappingImportOptionsPayload) => Promise<MappingImportPlanResult>;
  onImport: (payload: MappingImportOptionsPayload) => Promise<MappingImportResult>;
}

/** Excel-style column letter for a 0-based index. */
function columnLetter(index: number | undefined): string {
  if (index === undefined) return '—';
  return String.fromCharCode(65 + index);
}

function issueLabel(issue: ImportRowIssue): string {
  const incoming = issue.incoming
    ? [issue.incoming.zhCN, issue.incoming.zhTW].filter(Boolean).join(' / ')
    : '';
  const existing = issue.existing
    ? [issue.existing.zhCN, issue.existing.zhTW].filter(Boolean).join(' / ')
    : '';
  const parts = [`row ${issue.row}`, issue.en || '(empty)'];
  if (incoming) parts.push(`→ ${incoming}`);
  if (existing) parts.push(`(existing: ${existing})`);
  return parts.join(' · ');
}

/** Group row issues for the collapsible detail lists. */
function groupIssues(issues: ImportRowIssue[]) {
  return {
    conflicts: issues.filter((i) => i.kind === 'conflictInFile' || i.kind === 'conflictWithDb'),
    duplicates: issues.filter((i) => i.kind === 'dupInFile'),
    sameAsDb: issues.filter((i) => i.kind === 'sameAsDb'),
    invalid: issues.filter((i) => i.kind === 'invalid'),
  };
}

/**
 * Import preview dialog.
 *
 * Shows the detected column mapping, lets the user switch between
 * append / replace and the conflict strategy, and always renders the exact
 * plan (insert / update / delete / skip + row details) before applying it.
 */
export const MappingImportModal: React.FC<MappingImportModalProps> = ({
  parseResult,
  onClose,
  onReplan,
  onImport,
}) => {
  const [mode, setMode] = useState<GlossaryImportMode>('append');
  const [strategy, setStrategy] = useState<ConflictStrategy>('overwrite');
  const [keepDefaults, setKeepDefaults] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(parseResult.sheetIndex);
  const [columns, setColumns] = useState<GlossaryColumnMap>(parseResult.columns);
  const [preview, setPreview] = useState<ParsedGlossaryRow[]>(parseResult.preview);
  const [warnings, setWarnings] = useState<string[]>(parseResult.warnings);
  const [plan, setPlan] = useState<ImportPlan>(parseResult.plan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MappingImportResult | null>(null);

  const firstRun = useRef(true);
  const requestSeq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // Recompute the plan whenever an option changes (skipping the initial render).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    onReplan({
      parseId: parseResult.parseId,
      mode,
      strategy,
      keepDefaults,
      sheetIndex,
    })
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setPlan(res.plan);
        setColumns(res.columns);
        setPreview(res.preview);
        setWarnings(res.warnings);
        setSheetIndex(res.sheetIndex);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (seq === requestSeq.current) setBusy(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, strategy, keepDefaults, sheetIndex]);

  const handleImport = async () => {
    if (mode === 'replace') {
      const message = formatUi(ui.settings.replaceConfirm, { count: plan.toDelete });
      if (!window.confirm(message)) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onImport({
        parseId: parseResult.parseId,
        mode,
        strategy,
        keepDefaults,
        sheetIndex,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const groups = groupIssues(plan.issues);
  const extraIssues = plan.issueCount - plan.issues.length;
  const hasSeq = columns.seq !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-[900px] max-w-[94vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-100">📥 {ui.settings.importGlossaryTitle}</h3>
          <span className="text-xs text-gray-500 truncate">{parseResult.fileName}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">
            {formatUi(ui.settings.planTotalRows, { count: plan.totalRows })}
          </span>
        </div>

        <div className="px-5 py-4 overflow-y-auto min-h-0 space-y-3">
          {/* Column detection */}
          <section className="text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-gray-400">{ui.settings.detectedColumnsTitle}:</span>
              <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-200">
                {ui.settings.glossaryNo} = {columnLetter(columns.seq)}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-200">
                en-US = {columnLetter(columns.en)}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-200">
                zh-CN = {columnLetter(columns.zhCN)}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-200">
                zh-TW = {columnLetter(columns.zhTW)}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded text-amber-300/80">
                ⛔ {ui.settings.doNotUse} = {columnLetter(columns.forbidden)}
              </span>
              <span className="text-gray-500">
                (
                {columns.detectedBy === 'header'
                  ? formatUi(ui.settings.detectedByHeader, { row: columns.headerRow ?? 1 })
                  : columns.detectedBy === 'manual'
                    ? ui.settings.detectedByManual
                    : ui.settings.detectedByPosition}
                )
              </span>
              {parseResult.sheets.length > 1 && (
                <span className="flex items-center gap-1">
                  <span className="text-gray-400">{ui.settings.sheetLabel}:</span>
                  <select
                    value={sheetIndex}
                    onChange={(e) => setSheetIndex(Number(e.target.value))}
                    className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
                    disabled={busy}
                  >
                    {parseResult.sheets.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </div>
            {warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-amber-400">
                {warnings.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Import options */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="bg-gray-900/40 border border-gray-700 rounded p-3">
              <p className="text-xs font-medium text-gray-300 mb-2">{ui.settings.importModeLabel}</p>
              <label className="flex items-start gap-2 text-xs text-gray-300 mb-1">
                <input
                  type="radio"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                  disabled={busy}
                />
                <span>
                  {ui.settings.importModeAppend}
                  <span className="block text-[10px] text-gray-500">{ui.settings.importModeAppendHint}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-gray-300">
                <input
                  type="radio"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  disabled={busy}
                />
                <span>
                  {ui.settings.importModeReplace}
                  <span className="block text-[10px] text-gray-500">{ui.settings.importModeReplaceHint}</span>
                </span>
              </label>
              {mode === 'replace' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={keepDefaults}
                    onChange={(e) => setKeepDefaults(e.target.checked)}
                    disabled={busy}
                  />
                  {ui.settings.keepDefaults}
                </label>
              )}
            </div>

            <div className="bg-gray-900/40 border border-gray-700 rounded p-3">
              <p className="text-xs font-medium text-gray-300 mb-2">{ui.settings.conflictStrategyLabel}</p>
              <label className="flex items-center gap-2 text-xs text-gray-300 mb-1">
                <input
                  type="radio"
                  checked={strategy === 'overwrite'}
                  onChange={() => setStrategy('overwrite')}
                  disabled={busy}
                />
                {ui.settings.strategyOverwrite}
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="radio"
                  checked={strategy === 'keepExisting'}
                  onChange={() => setStrategy('keepExisting')}
                  disabled={busy}
                />
                {ui.settings.strategyKeepExisting}
              </label>
            </div>
          </section>

          {/* Plan summary */}
          <section className="text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-1 bg-green-700/40 border border-green-600/50 rounded text-green-200">
                +{plan.toInsert}
              </span>
              <span className="px-2 py-1 bg-blue-700/40 border border-blue-600/50 rounded text-blue-200">
                ↻{plan.toUpdate}
              </span>
              {mode === 'replace' && (
                <span className="px-2 py-1 bg-red-700/40 border border-red-600/50 rounded text-red-200">
                  −{plan.toDelete}
                </span>
              )}
              <span className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-300">
                ⤼{plan.skipped}
              </span>
              <span className="text-gray-500">
                {formatUi(ui.settings.planSummary, {
                  insert: plan.toInsert,
                  update: plan.toUpdate,
                  delete: plan.toDelete,
                  skipped: plan.skipped,
                })}
              </span>
            </div>

            {plan.issueCount > 0 && (
              <div className="mt-2 space-y-1">
                {groups.conflicts.length > 0 && (
                  <IssueGroup
                    title={formatUi(ui.settings.issueConflicts, { count: groups.conflicts.length })}
                    issues={groups.conflicts}
                  />
                )}
                {groups.duplicates.length > 0 && (
                  <IssueGroup
                    title={formatUi(ui.settings.issueDuplicates, { count: groups.duplicates.length })}
                    issues={groups.duplicates}
                  />
                )}
                {groups.sameAsDb.length > 0 && (
                  <IssueGroup
                    title={formatUi(ui.settings.issueSameAsDb, { count: groups.sameAsDb.length })}
                    issues={groups.sameAsDb}
                  />
                )}
                {groups.invalid.length > 0 && (
                  <IssueGroup
                    title={formatUi(ui.settings.issueInvalid, { count: groups.invalid.length })}
                    issues={groups.invalid}
                  />
                )}
                {extraIssues > 0 && (
                  <p className="text-[10px] text-gray-500">
                    {formatUi(ui.settings.issueMore, { count: extraIssues })}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Preview table */}
          <section className="border border-gray-700 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-700/60 text-gray-300">
                  {hasSeq && <th className="px-3 py-1.5 text-left font-medium w-14">{ui.settings.glossaryNo}</th>}
                  <th className="px-3 py-1.5 text-left font-medium">{ui.settings.english}</th>
                  <th className="px-3 py-1.5 text-left font-medium">{ui.settings.simplifiedChinese}</th>
                  <th className="px-3 py-1.5 text-left font-medium">{ui.settings.traditionalChinese}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60">
                {preview.map((r) => (
                  <tr key={r.row} className="text-gray-300">
                    {hasSeq && <td className="px-3 py-1.5 text-gray-500">{r.seq ?? '—'}</td>}
                    <td className="px-3 py-1.5 break-all">{r.en}</td>
                    <td className="px-3 py-1.5 break-all">{r.zhCN}</td>
                    <td className="px-3 py-1.5 break-all">{r.zhTW}</td>
                  </tr>
                ))}
                {preview.length === 0 && (
                  <tr>
                    <td colSpan={hasSeq ? 4 : 3} className="px-3 py-4 text-center text-gray-500">
                      {ui.settings.noValidRows}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {plan.totalRows > preview.length && (
              <div className="px-3 py-1.5 text-[10px] text-gray-500 border-t border-gray-700/60">
                {formatUi(ui.settings.showingFirstRows, { count: plan.totalRows })}
              </div>
            )}
          </section>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Import result */}
          {result && (
            <section className="text-xs space-y-1">
              <p className="text-green-400">
                ✅{' '}
                {formatUi(ui.settings.importSummary, {
                  insert: result.toInsert,
                  update: result.toUpdate,
                  delete: result.toDelete,
                  skipped: result.skipped,
                })}
              </p>
              {result.backupPath && (
                <p className="text-gray-400 break-all">
                  {formatUi(ui.settings.importBackupPath, { path: result.backupPath })}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center gap-3 shrink-0">
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded transition-colors"
          >
            {ui.common.close}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={busy || plan.totalRows === 0}
              className={`px-4 py-1.5 disabled:opacity-50 text-white text-sm rounded transition-colors ${
                mode === 'replace' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {busy ? ui.settings.importing : `✅ ${ui.settings.confirmImport}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Collapsible list of row-level issues. */
const IssueGroup: React.FC<{ title: string; issues: ImportRowIssue[] }> = ({ title, issues }) => (
  <details className="border border-gray-700 rounded">
    <summary className="px-2 py-1 cursor-pointer text-gray-400 hover:text-gray-200 select-none">
      {title}
    </summary>
    <div className="max-h-32 overflow-y-auto px-2 pb-1 space-y-0.5">
      {issues.map((issue, index) => (
        <p key={`${issue.row}-${index}`} className="text-[10px] text-gray-500 break-all">
          · {issueLabel(issue)}
        </p>
      ))}
    </div>
  </details>
);
