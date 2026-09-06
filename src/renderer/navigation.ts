import { en as ui } from '../shared/i18n';

// Shared tab navigation metadata for the renderer app shell.
// Single source of truth for the top-level tabs (App.tsx / AppLayout.tsx / OverviewTab).

export type TabId = 'overview' | 'doc-generator' | 'localization' | 'settings';

export interface TabMeta {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}

export const TABS: TabMeta[] = [
  { id: 'overview', label: ui.navigation.overview, icon: '🏠', description: ui.navigation.overviewDescription },
  { id: 'doc-generator', label: ui.navigation.docGenerator, icon: '📄', description: ui.navigation.docGeneratorDescription },
  { id: 'localization', label: ui.navigation.localization, icon: '🌐', description: ui.navigation.localizationDescription },
  { id: 'settings', label: ui.navigation.settings, icon: '⚙️', description: ui.navigation.settingsDescription },
];
