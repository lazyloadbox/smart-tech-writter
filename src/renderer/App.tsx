import React, { useState } from 'react';
import { AppLayout } from './components/Layout/AppLayout';
import { DocGeneratorTab } from './features/doc-generator/index';
import { SettingsTab } from './features/settings/SettingsTab';

type Tab = 'doc-generator' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('doc-generator');

  return (
    <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'doc-generator' && <DocGeneratorTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </AppLayout>
  );
};
