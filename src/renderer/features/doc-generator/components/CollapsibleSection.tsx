import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * A reusable collapsible section with a toggle header.
 * Content is hidden/shown by clicking the header bar.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultExpanded = true,
  children,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={className}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-gray-800/60 transition-colors group"
      >
        <span className="text-[10px] text-gray-500 transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▶
        </span>
        <span className="text-xs text-gray-400 font-semibold group-hover:text-gray-300 transition-colors">
          {title}
        </span>
        <span className="text-[10px] text-gray-600 ml-auto">
          {expanded ? '点击折叠' : '点击展开'}
        </span>
      </button>
      {expanded && <div className="mt-1">{children}</div>}
    </div>
  );
};
