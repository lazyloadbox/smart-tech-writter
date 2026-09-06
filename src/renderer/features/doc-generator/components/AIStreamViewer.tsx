import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { StageName } from '../../../../shared/types/workflow.types';
import { en as ui, formatUi } from '../../../../shared/i18n';
import { MarkdownRenderer } from './MarkdownRenderer';

interface StreamChunk {
  stage: StageName;
  /** `thinking` = reasoning_content (model's thinking), `content` = visible output. */
  type: 'thinking' | 'content';
  content: string;
  timestamp: string;
}

interface AIStreamViewerProps {
  chunks: StreamChunk[];
  currentStage: StageName;
  isRunning: boolean;
}

/**
 * Try to parse a string as a single JSON object/array. Returns the parsed object or null.
 */
function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return JSON.parse(trimmed);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract JSON objects from a text that may contain markdown or other content.
 */
function extractJsonBlocks(text: string): Array<{ json: Record<string, unknown>; raw: string }> {
  const results: Array<{ json: Record<string, unknown>; raw: string }> = [];
  // Try to find JSON blocks (code fences with json)
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const parsed = tryParseJson(match[1]);
    if (parsed) {
      results.push({ json: parsed, raw: match[1] });
    }
  }
  return results;
}

/**
 * Extract individual JSON objects from concatenated JSON texts like:
 *   {...}{...}{...}
 * This iteratively finds matching brace pairs using a depth counter.
 * Handles incomplete trailing JSON (still streaming) gracefully.
 */
function extractConcatenatedJsons(text: string): Array<{ json: Record<string, unknown>; raw: string }> {
  const results: Array<{ json: Record<string, unknown>; raw: string }> = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf('{');
    if (startIdx === -1) break;

    // Move past any non-JSON prefix (text before first '{')
    remaining = remaining.slice(startIdx);

    // Walk through characters counting brace depth
    let depth = 0;
    let jsonEnd = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === '{') {
        depth++;
      } else if (remaining[i] === '}') {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1; // inclusive end
          break;
        }
      }
    }

    if (jsonEnd === -1) break; // incomplete JSON (still streaming)

    const candidate = remaining.slice(0, jsonEnd);
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        results.push({ json: parsed as Record<string, unknown>, raw: candidate });
      }
    } catch {
      // Not valid JSON — skip it and continue searching
    }

    remaining = remaining.slice(jsonEnd).trim();
  }

  return results;
}

/**
 * Structured card for displaying a key-value pair from parsed JSON.
 */
const JsonField: React.FC<{ label: string; value: unknown }> = ({ label, value }) => {
  if (value === null || value === undefined || value === '') return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <div className="mb-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {value.map((item, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-blue-900/40 text-blue-300 text-[10px] rounded border border-blue-800/50">
              {String(item)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return null;
    return (
      <div className="mb-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <div className="mt-1 space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[11px]">
              <span className="text-gray-500 shrink-0">{k}:</span>
              <span className="text-gray-300 break-all">{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const str = String(value);
  if (str.length > 200) {
    return (
      <div className="mb-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <p className="text-xs text-gray-300 mt-1 leading-relaxed">{str}</p>
      </div>
    );
  }

  return (
    <div className="mb-1.5 flex gap-2 text-[11px]">
      <span className="font-medium text-gray-400 shrink-0">{label}:</span>
      <span className="text-gray-300 break-all">{str}</span>
    </div>
  );
};

/**
 * Renders a parsed JSON object as structured cards.
 */
const StructuredJsonView: React.FC<{ data: Record<string, unknown>; title?: string }> = ({ data, title }) => {
  // Check if it looks like an AnalysisResult
  const isAnalysisResult = 'summary' in data && ('keywords' in data || 'keyPoints' in data || 'technicalTerms' in data);
  // File parsing has an overview plus an evidence array. Render the array as
  // readable extraction cards instead of coercing item objects to "[object Object]".
  const isFileExtraction = 'overview' in data && Array.isArray(data.items);
  // Check if it looks like a ReviewComment
  const isReviewComment = 'type' in data && 'explanation' in data && ('error' === data.type || 'warning' === data.type || 'suggestion' === data.type || 'info' === data.type);
  // Check if it contains a "fileName" or "file" field
  const hasFileName = 'fileName' in data || 'file' in data || 'file_name' in data;

  return (
    <div className="p-3 bg-gray-800/70 rounded border border-gray-700 mb-2">
      {/* Header */}
      {(title || hasFileName) && (
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
          {hasFileName && (
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1">
              📄 {String(data.fileName || data.file || data.file_name || ui.stream.unknownFile)}
            </span>
          )}
          {title && !hasFileName && (
            <span className="text-xs font-medium text-gray-300">{title}</span>
          )}
          {isAnalysisResult && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded ml-auto">{ui.stream.analysisResult}</span>
          )}
          {isReviewComment && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${
              data.type === 'error' ? 'bg-red-900/40 text-red-300' :
              data.type === 'warning' ? 'bg-yellow-900/40 text-yellow-300' :
              'bg-blue-900/40 text-blue-300'
            }`}>
              {ui.review.typeLabels[data.type as keyof typeof ui.review.typeLabels] ?? ui.review.typeLabels.info}
            </span>
          )}
        </div>
      )}

      {/* Fields */}
      <div className="space-y-0.5">
        {Object.entries(data)
          .filter(([key, value]) => value != null && value !== '' && !(isFileExtraction && key === 'items'))
          .map(([key, value]) => (
            <JsonField key={key} label={key} value={value} />
          ))}
        {isFileExtraction && (
          <div className="mt-2 rounded border border-blue-900/60 bg-blue-950/20 p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-blue-300">Extracted information</span>
              <span className="text-[10px] text-gray-500">{(data.items as unknown[]).length} items</span>
            </div>
            <div className="space-y-1.5">
              {(data.items as Array<Record<string, unknown>>).map((item, index) => (
                <div key={index} className="rounded bg-gray-900/70 p-2 text-[11px]">
                  <div className="text-gray-200">
                    [{String(item.importance ?? 'normal')}] {String(item.title ?? `Item ${index + 1}`)}
                  </div>
                  <div className="mt-0.5 leading-relaxed text-gray-400">{String(item.content ?? '')}</div>
                  {(item.sourceLocation || item.sourceQuote) && (
                    <div className="mt-1 text-[10px] text-gray-600">
                      {item.sourceLocation ? `Location: ${String(item.sourceLocation)}` : ''}
                      {item.sourceLocation && item.sourceQuote ? ' · ' : ''}
                      {item.sourceQuote ? `Source: ${String(item.sourceQuote)}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const AIStreamViewer: React.FC<AIStreamViewerProps> = ({ chunks, currentStage, isRunning }) => {
  const thinkingRef = useRef<HTMLDivElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const label = ui.stream.stageLabels[currentStage] ?? currentStage;
  const description = ui.stream.descriptions[currentStage] ?? '';

  // ── Hooks must be called unconditionally (Rules of Hooks) ──────────────
  // Visible output only — JSON parsing / raw view never include thinking text.
  const contentText = useMemo(
    () => chunks
      .filter((c) => c.stage === currentStage && c.type === 'content')
      .map((c) => c.content)
      .join(''),
    [chunks, currentStage],
  );
  // Reasoning deltas (reasoning_content) — shown live while the model thinks.
  const thinkingText = useMemo(
    () => chunks
      .filter((c) => c.stage === currentStage && c.type === 'thinking')
      .map((c) => c.content)
      .join(''),
    [chunks, currentStage],
  );

  // Auto-scroll the thinking area so the latest reasoning message stays visible.
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText]);
  const parsedJson = useMemo(() => tryParseJson(contentText), [contentText]);
  const jsonBlocks = useMemo(() => extractJsonBlocks(contentText), [contentText]);
  const concatenatedJsons = useMemo(() => extractConcatenatedJsons(contentText), [contentText]);

  // ── Early-return logic after all hooks ─────────────────────────────────
  const aiStages: StageName[] = [
    'upload_parse', 'analyze', 'draft', 'ai_review',
    'dita_ai_review',
  ];
  const isAiStage = aiStages.includes(currentStage);

  if (!isAiStage || chunks.length === 0) {
    if (!isAiStage || !isRunning) return null;
    // Show waiting state for AI stages
    return (
      <div className="p-4 bg-gray-800 rounded border border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-blue-300">🤖 {label}</span>
        </div>
        <p className="text-xs text-gray-500">{description || ui.stream.waitingAi}</p>
      </div>
    );
  }

  if (!contentText && !thinkingText) return null;

  // Determine render mode: try single JSON → code-fence blocks → concatenated JSONs
  const hasStructuredData = parsedJson !== null || jsonBlocks.length > 0 || concatenatedJsons.length > 0;

  return (
    <div className="p-4 bg-gray-800 rounded border border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {isRunning ? (
          <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-green-400">✓</span>
        )}
        <span className="text-sm font-medium text-blue-300">🤖 {label}</span>
        <span className="text-xs text-gray-500 ml-auto">
          {formatUi(ui.stream.chunks, { count: chunks.filter(c => c.stage === currentStage).length })}
        </span>
        {/* Toggle raw/structured */}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-[10px] px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition-colors"
          title={showRaw ? ui.stream.switchToStructured : ui.stream.switchToRaw}
        >
          {showRaw ? `📋 ${ui.stream.structured}` : `{ } ${ui.stream.raw}`}
        </button>
      </div>

      {/* Stage description */}
      <p className="text-xs text-gray-500 mb-3">{description}</p>

      {/* Thinking (reasoning_content) — streamed live while the model thinks */}
      {thinkingText && (
        <details
          className="mb-3 bg-gray-900/60 rounded border border-gray-700/70 overflow-hidden"
          open={isRunning}
        >
          <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-gray-800/60">
            {isRunning ? (
              <span className="inline-block w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-amber-400">🧠</span>
            )}
            <span className="text-xs font-medium text-amber-300/90">{ui.localization.thinking}</span>
            <span className="text-[10px] text-gray-500 ml-auto">
              {formatUi(ui.stream.chunks, { count: chunks.filter((c) => c.stage === currentStage && c.type === 'thinking').length })}
            </span>
          </summary>
          <div className="px-3 pb-3">
            <div
              ref={thinkingRef}
              className="max-h-60 overflow-y-auto pr-1"
            >
              <pre className="text-[11px] text-amber-200/60 italic font-mono whitespace-pre-wrap break-words leading-relaxed">
                {thinkingText}
              </pre>
              {isRunning && (
                <span className="inline-block w-2 h-3.5 bg-amber-400/70 animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          </div>
        </details>
      )}

      {/* Content area — flows naturally inside the parent scroll container */}
      <div className="bg-gray-900 rounded p-3 border border-gray-700">
        {!contentText ? (
          /* No visible output yet — still thinking or waiting */
          <p className="text-xs text-gray-500">
            {isRunning ? ui.stream.waitingAi : ui.stream.noOutput}
          </p>
        ) : showRaw || !hasStructuredData ? (
          /* Raw text view */
          <>
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words">
              {contentText}
            </pre>
            {isRunning && (
              <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
            )}
          </>
        ) : (
          /* Structured view */
          <div className="space-y-2">
            {/* If the whole text is a single JSON object */}
            {parsedJson && !Array.isArray(parsedJson) && (
              <StructuredJsonView data={parsedJson} />
            )}

            {/* If it's a JSON array */}
            {parsedJson && Array.isArray(parsedJson) && (
              <>
                <p className="text-[10px] text-gray-500 mb-1">{formatUi(ui.stream.records, { count: parsedJson.length })}</p>
                {parsedJson.map((item, i) => (
                  <StructuredJsonView
                    key={i}
                    data={item as Record<string, unknown>}
                    title={`#${i + 1}`}
                  />
                ))}
              </>
            )}

            {/* Extract JSON blocks from mixed text */}
            {!parsedJson && jsonBlocks.length > 0 && (
              <>
                {jsonBlocks.map((block, i) => (
                  <StructuredJsonView key={i} data={block.json} title={formatUi(ui.stream.parsedBlock, { index: i + 1 })} />
                ))}
                {/* Show remaining non-JSON text if any */}
                {contentText.replace(/```(?:json)?\s*\n[\s\S]*?\n```/g, '').trim() && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
                      {ui.stream.viewAdditionalText}
                    </summary>
                    <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-words mt-1 p-2 bg-gray-950 rounded">
                      {contentText.replace(/```(?:json)?\s*\n[\s\S]*?\n```/g, '').trim()}
                    </pre>
                  </details>
                )}
              </>
            )}

            {/* Concatenated JSON objects — e.g. {...}{...}{...} */}
            {!parsedJson && jsonBlocks.length === 0 && concatenatedJsons.length > 0 && (
              <>
                <p className="text-[10px] text-gray-500 mb-1">
                  {currentStage === 'upload_parse'
                    ? formatUi(ui.stream.parsedFiles, { count: concatenatedJsons.length })
                    : formatUi(ui.stream.structuredData, { count: concatenatedJsons.length })}
                </p>
                {concatenatedJsons.map((block, i) => (
                  <StructuredJsonView
                    key={i}
                    data={block.json}
                    title={currentStage === 'upload_parse' ? `${ui.stream.analysisResult} #${i + 1}` : `#${i + 1}`}
                  />
                ))}
                {/* Show any remaining non-JSON text after extraction */}
                {(() => {
                  let remaining = contentText;
                  for (const block of concatenatedJsons) {
                    remaining = remaining.replace(block.raw, '');
                  }
                  return remaining.trim();
                })() && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
                      {ui.stream.viewAdditionalText}
                    </summary>
                    <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-words mt-1 p-2 bg-gray-950 rounded">
                      {(() => {
                        let remaining = contentText;
                        for (const block of concatenatedJsons) {
                          remaining = remaining.replace(block.raw, '');
                        }
                        return remaining.trim();
                      })()}
                    </pre>
                  </details>
                )}
              </>
            )}

            {/* Streaming indicator */}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-blue-400 mt-2">
                <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse" />
                {ui.stream.receiving}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
