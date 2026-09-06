import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { en as ui, formatUi } from '../../../../shared/i18n';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

interface AiArtifactChatProps {
  /** Current artifact snapshot. It is sent with every new instruction. */
  currentContent: string;
  /** The callback that invokes the format-aware AI editor. */
  onAiEdit: (currentContent: string, instruction: string) => Promise<string>;
  /** Apply the complete artifact returned by the AI to the owning editor/state. */
  onApply: (editedContent: string) => void;
  /** Optional label describing the artifact currently being edited. */
  artifactLabel?: string;
}

/**
 * Compact chat-style human ↔ AI editor shared by every confirmation step.
 * The editor always sends the latest artifact, so follow-up instructions work
 * as a conversation even when the user also edits the artifact manually.
 */
export const AiArtifactChat: React.FC<AiArtifactChatProps> = ({
  currentContent,
  onAiEdit,
  onApply,
  artifactLabel,
}) => {
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nextIdRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = 144;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [instruction, isExpanded]);

  const appendMessage = (role: ChatMessage['role'], text: string) => {
    const id = nextIdRef.current++;
    setMessages((prev) => [...prev, { id, role, text }]);
  };

  const handleSubmit = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || isEditing) return;
    setError(null);
    appendMessage('user', trimmed);
    setInstruction('');
    setIsEditing(true);
    try {
      const edited = await onAiEdit(currentContent, trimmed);
      if (!edited.trim()) throw new Error(ui.docGenerator.emptyAiResponse);
      onApply(edited);
      appendMessage('assistant', ui.docGenerator.aiChat.applied);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      // Keep a failed instruction in the box so the user can retry or refine
      // it without having to type the request again.
      setInstruction(trimmed);
      appendMessage('error', formatUi(ui.docGenerator.aiChat.failed, { error: message }));
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <section className="shrink-0 border-t border-gray-700 bg-gray-800/95 px-3 py-2">
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        title={isExpanded ? ui.docGenerator.aiChat.collapse : ui.docGenerator.aiChat.expand}
        className="flex w-full items-center justify-between gap-3 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-700/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-blue-300">🤖 {ui.docGenerator.aiChat.title}</span>
          <span className="truncate text-[11px] text-gray-500">
            {artifactLabel ? `${artifactLabel} · ` : ''}{ui.docGenerator.aiChat.description}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[10px] text-gray-500">
          {isEditing && <span className="text-blue-300">● {ui.docGenerator.aiChat.working}</span>}
          {!isEditing && messages.length > 0 && (
            <span>{messages.length} {ui.docGenerator.aiChat.turns}</span>
          )}
          {!isEditing && instruction.trim() && <span className="text-amber-300">● {ui.docGenerator.aiChat.draft}</span>}
          <span aria-hidden="true" className="text-sm leading-none">{isExpanded ? '▾' : '▸'}</span>
        </span>
      </button>

      {isExpanded && (
        <div id={panelId} className="pt-1">
          {messages.length > 0 && (
            <div
              ref={messagesRef}
              aria-live="polite"
              className="mb-2 max-h-24 space-y-1 overflow-y-auto pr-1"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded px-2 py-1 text-[11px] ${
                    message.role === 'user'
                      ? 'ml-8 bg-blue-900/40 text-blue-200'
                      : message.role === 'error'
                        ? 'mr-8 bg-red-900/30 text-red-300'
                        : 'mr-8 bg-gray-700/80 text-green-300'
                  }`}
                >
                  <span className="mr-1 font-medium">
                    {message.role === 'user' ? ui.docGenerator.aiChat.you : ui.docGenerator.aiChat.assistant}
                  </span>
                  {message.text}
                </div>
              ))}
            </div>
          )}
          {error && <p className="mb-1 text-[11px] text-red-400">⚠ {error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={instruction}
              aria-label={ui.docGenerator.aiChat.inputLabel}
              onChange={(event) => {
                setInstruction(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={isEditing}
              rows={2}
              className="min-h-[42px] max-h-36 flex-1 resize-none overflow-y-hidden rounded border border-gray-700 bg-gray-900 px-2.5 py-2 text-xs leading-5 text-gray-200 outline-none focus:border-blue-500 disabled:opacity-60"
              placeholder={ui.docGenerator.aiChat.placeholder}
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isEditing || !instruction.trim()}
              className="shrink-0 rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEditing ? `⏳ ${ui.docGenerator.aiChat.working}` : `↗ ${ui.docGenerator.aiChat.send}`}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-600">{ui.docGenerator.aiChat.shortcut}</p>
        </div>
      )}
    </section>
  );
};
