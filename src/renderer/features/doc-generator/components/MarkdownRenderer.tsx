import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { en as ui } from '../../../../shared/i18n';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with GitHub Flavored Markdown support.
 * Used for AI-generated draft text and other markdown content.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const components = useMemo(
    () => ({
      // Headings
      h1: ({ children, ...props }: Record<string, unknown>) => (
        <h1 className="text-xl font-bold text-gray-100 mt-4 mb-2 first:mt-0" {...props}>{children as React.ReactNode}</h1>
      ),
      h2: ({ children, ...props }: Record<string, unknown>) => (
        <h2 className="text-lg font-semibold text-gray-100 mt-3 mb-1.5 first:mt-0" {...props}>{children as React.ReactNode}</h2>
      ),
      h3: ({ children, ...props }: Record<string, unknown>) => (
        <h3 className="text-base font-semibold text-gray-200 mt-2 mb-1" {...props}>{children as React.ReactNode}</h3>
      ),
      h4: ({ children, ...props }: Record<string, unknown>) => (
        <h4 className="text-sm font-semibold text-gray-200 mt-2 mb-1" {...props}>{children as React.ReactNode}</h4>
      ),
      // Paragraphs
      p: ({ children, ...props }: Record<string, unknown>) => (
        <p className="text-sm text-gray-300 leading-relaxed mb-2 last:mb-0" {...props}>{children as React.ReactNode}</p>
      ),
      // Links
      a: ({ children, href, ...props }: Record<string, unknown>) => (
        <a className="text-blue-400 hover:text-blue-300 underline" href={href as string} target="_blank" rel="noopener noreferrer" {...props}>{children as React.ReactNode}</a>
      ),
      // Lists
      ul: ({ children, ...props }: Record<string, unknown>) => (
        <ul className="list-disc list-inside text-sm text-gray-300 mb-2 space-y-0.5" {...props}>{children as React.ReactNode}</ul>
      ),
      ol: ({ children, ...props }: Record<string, unknown>) => (
        <ol className="list-decimal list-inside text-sm text-gray-300 mb-2 space-y-0.5" {...props}>{children as React.ReactNode}</ol>
      ),
      li: ({ children, ...props }: Record<string, unknown>) => (
        <li className="text-sm text-gray-300" {...props}>{children as React.ReactNode}</li>
      ),
      // Code blocks (inline)
      code: ({ children, className: codeClass, ...props }: Record<string, unknown>) => {
        const isInline = !codeClass;
        if (isInline) {
          return (
            <code className="px-1 py-0.5 bg-gray-700 text-pink-300 text-xs rounded font-mono" {...props}>
              {children as React.ReactNode}
            </code>
          );
        }
        return (
          <code className={`block p-3 bg-gray-800 text-gray-300 text-xs rounded font-mono overflow-x-auto ${codeClass || ''}`} {...props}>
            {children as React.ReactNode}
          </code>
        );
      },
      // Code blocks (fenced)
      pre: ({ children, ...props }: Record<string, unknown>) => (
        <pre className="bg-gray-800 rounded p-3 overflow-x-auto mb-2 text-xs" {...props}>{children as React.ReactNode}</pre>
      ),
      // Blockquotes
      blockquote: ({ children, ...props }: Record<string, unknown>) => (
        <blockquote className="border-l-4 border-blue-500 pl-3 py-1 my-2 bg-gray-800/50 rounded-r" {...props}>{children as React.ReactNode}</blockquote>
      ),
      // Tables
      table: ({ children, ...props }: Record<string, unknown>) => (
        <div className="overflow-x-auto mb-2">
          <table className="min-w-full border-collapse border border-gray-700 text-xs" {...props}>{children as React.ReactNode}</table>
        </div>
      ),
      thead: ({ children, ...props }: Record<string, unknown>) => (
        <thead className="bg-gray-800" {...props}>{children as React.ReactNode}</thead>
      ),
      th: ({ children, ...props }: Record<string, unknown>) => (
        <th className="border border-gray-700 px-2 py-1 text-left text-gray-200 font-medium" {...props}>{children as React.ReactNode}</th>
      ),
      td: ({ children, ...props }: Record<string, unknown>) => (
        <td className="border border-gray-700 px-2 py-1 text-gray-300" {...props}>{children as React.ReactNode}</td>
      ),
      // Emphasis
      strong: ({ children, ...props }: Record<string, unknown>) => (
        <strong className="font-semibold text-gray-100" {...props}>{children as React.ReactNode}</strong>
      ),
      em: ({ children, ...props }: Record<string, unknown>) => (
        <em className="italic text-gray-300" {...props}>{children as React.ReactNode}</em>
      ),
      // Horizontal rule
      hr: (props: Record<string, unknown>) => (
        <hr className="border-gray-700 my-3" {...props} />
      ),
      // Images
      img: ({ src, alt, ...props }: Record<string, unknown>) => (
        <img className="max-w-full rounded my-2" src={src as string} alt={alt as string} {...props} />
      ),
    }),
    []
  );

  if (!content || content.trim().length === 0) {
    return <span className="text-xs text-gray-500 italic">{ui.common.noContent}</span>;
  }

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
