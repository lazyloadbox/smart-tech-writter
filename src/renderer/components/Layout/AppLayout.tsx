import React from 'react';

type Tab = 'doc-generator' | 'settings';

interface AppLayoutProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ activeTab, onTabChange, children }) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-900">
      {/* Top Tab Bar */}
      <div className="flex items-center bg-gray-800 border-b border-gray-700 px-4 h-10 shrink-0">
        <span className="text-blue-400 font-semibold text-sm mr-6">Smart Tech Writer</span>
        <TabButton active={activeTab === 'doc-generator'} onClick={() => onTabChange('doc-generator')}>
          Doc Generator
        </TabButton>
        <TabButton active={activeTab === 'settings'} onClick={() => onTabChange('settings')}>
          Settings
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active, onClick, children,
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-blue-400 text-blue-400'
        : 'border-transparent text-gray-400 hover:text-gray-200'
    }`}
  >
    {children}
  </button>
);
