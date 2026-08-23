import React, { useState } from 'react';
import { AppLayout } from './components/Layout/AppLayout';
import { DocGeneratorTab } from './features/doc-generator/index';
import { SettingsTab } from './features/settings/SettingsTab';
import { OverviewTab } from './features/overview/index';
import { LocalizationTab } from './features/localization/index';
import type { TabId } from './navigation';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'overview' && <OverviewTab onNavigate={setActiveTab} />}
      {activeTab === 'doc-generator' && <DocGeneratorTab />}
      {activeTab === 'localization' && <LocalizationTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </AppLayout>
  );
};
