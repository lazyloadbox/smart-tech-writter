import React, { useState, useEffect, useRef } from 'react';
import type { DocumentDraft } from '../../../../shared/types/document.types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AiDraftEditorProps {
  drafts: DocumentDraft[];
  /** Called whenever the edited content changes (so parent can store it). */
  onContentChange: (content: string) => void;
  /** Invoke the AI edit IPC. Returns the edited markdown. */
  onAiEdit: (currentContent: string, instruction: string) => Promise<string>;
}

/**
 * Stage 3a (review_draft) editor with AI prompt-based editing.
 *
 * Layout:
 * - Left: editable textarea of the draft markdown (user can manually edit too)
 * - Right: live rendered markdown preview
 * - Bottom: prompt input + "AI 修改" button. Clicking sends the current
 *   content + instruction to the AI (streamed), then replaces the textarea
 *   content with the result. The user can accept/reject (undo) before
 *   continuing.
 *
 * The edited content is reported up via onContentChange so the parent
 * (review_draft stage) can store it and apply it when continuing.
 */
export const AiDraftEditor: React.FC<AiDraftEditorProps> = ({ drafts, onContentChange, onAiEdit }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [content, setContent] = useState(drafts[activeIdx]?.content ?? '');
  const [instruction, setInstruction] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep the last pre-edit content so the user can undo an AI edit.
  const lastContentRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local content when the active draft changes.
  useEffect(() => {
    setContent(drafts[activeIdx]?.content ?? '');
    lastContentRef.current = '';
  }, [activeIdx, drafts]);

  // Report content changes up.
  useEffect(() => {
    onContentChange(content);
  }, [content, onContentChange]);

  if (drafts.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">暂无草稿</p>;
  }

  const handleAiEdit = async () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setError('请输入修改指令，例如："把第4节的 API 函数说明更新为 v3.0.0+ 的 ledcAttach()"');
      return;
    }
    setError(null);
    setIsEditing(true);
    lastContentRef.current = content;
    try {
      const edited = await onAiEdit(content, trimmed);
      if (edited && edited.trim()) {
        setContent(edited);
        setInstruction('');
      } else {
        setError('AI 返回了空内容，未做修改。');
      }
    } catch (err) {
      setError(`AI 修改失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsEditing(false);
    }
  };

  const handleUndo = () => {
    if (lastContentRef.current) {
      setContent(lastContentRef.current);
      lastContentRef.current = '';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Draft tabs */}
      {drafts.length > 1 && (
        <div className="flex border-b border-gray-700 px-4 bg-gray-800 shrink-0">
          {drafts.map((d, idx) => (
            <button
              key={d.id}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                idx === activeIdx ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}

      {/* Side-by-side: editor | preview */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-700">
          <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0 flex items-center justify-between">
            <span className="text-xs text-gray-400">📝 草稿内容（可直接编辑）</span>
            {lastContentRef.current && (
              <button
                onClick={handleUndo}
                className="text-xs text-yellow-400 hover:text-yellow-300"
                title="撤销上次 AI 修改"
              >
                ↩ 撤销 AI 修改
              </button>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="flex-1 bg-gray-900 text-gray-300 text-sm p-4 resize-none outline-none font-mono overflow-y-auto"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="草稿内容..."
          />
        </div>
        {/* Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
            <span className="text-xs text-gray-400">👁 实时预览（Markdown 渲染）</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      </div>

      {/* AI prompt bar */}
      <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-300 whitespace-nowrap">🤖 AI 指令修改</span>
          <span className="text-[11px] text-gray-500">输入修改要求，AI 会基于当前草稿内容进行修改</span>
        </div>
        {error && (
          <p className="text-xs text-red-400">⚠ {error}</p>
        )}
        <div className="flex gap-2">
          <textarea
            className="flex-1 bg-gray-900 text-gray-200 text-sm p-2.5 rounded border border-gray-700 resize-none outline-none focus:border-blue-500 min-h-[60px] max-h-[120px]"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='例如："把第4节 Key Features 里的 ledcSetup 替换为 v3.0.0+ 的 ledcAttach，并补充参数说明"'
            rows={2}
            disabled={isEditing}
          />
          <button
            onClick={handleAiEdit}
            disabled={isEditing || !instruction.trim()}
            className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors whitespace-nowrap self-start"
          >
            {isEditing ? '⏳ AI 修改中...' : '🤖 AI 修改'}
          </button>
        </div>
        {isEditing && (
          <p className="text-[11px] text-blue-400 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            AI 正在根据指令修改草稿，请稍候...（可在下方日志面板查看流式输出）
          </p>
        )}
      </div>
    </div>
  );
};
