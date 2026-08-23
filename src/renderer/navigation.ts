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
  { id: 'overview', label: '总览', icon: '🏠', description: '功能入口与最近项目总览' },
  { id: 'doc-generator', label: 'Doc Generator', icon: '📄', description: '上传源文件，AI 生成技术文档（DITA / DOCX）' },
  { id: 'localization', label: '本地化', icon: '🌐', description: '将已生成的 DITA 文件翻译为多语言版本' },
  { id: 'settings', label: 'Settings', icon: '⚙️', description: 'AI 服务配置与提示词管理' },
];