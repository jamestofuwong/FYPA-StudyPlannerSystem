export type PanelId = 'dashboard' | 'pathway' | 'import' | 'scraping' | 'planners' | 'cloud-sync' | 'settings' | 'user-guide' | 'class-estimation' | 'copilot';

export const PANEL_IDS: PanelId[] = ['dashboard', 'pathway', 'import', 'scraping', 'planners', 'cloud-sync', 'settings', 'user-guide', 'class-estimation', 'copilot'];

export function isPanelId(value: string): value is PanelId {
  return (PANEL_IDS as string[]).includes(value);
}

export const PANEL_PATHS: Record<PanelId, string> = {
  dashboard: '/dashboard',
  pathway: '/pathway',
  import: '/import',
  scraping: '/scraping',
  planners: '/planners',
  units: '/units',
  'cloud-sync': '/cloud-sync',
  settings: '/settings',
  'user-guide': '/user-guide',
  copilot: '/copilot',
  'class-estimation': '/class-estimation',
};

export function panelToPath(panel: PanelId): string {
  return PANEL_PATHS[panel];
}

export function panelFromPathname(pathname: string): PanelId {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (!firstSegment) return 'dashboard';
  return isPanelId(firstSegment) ? firstSegment : 'dashboard';
}

export interface NavItem {
  id: PanelId;
  icon: string;
  label: string;
  badge?: number;
}

export interface NavSection {
  id: string;
  icon: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'main',
    icon: '📊',
    label: 'Major Detection',
    items: [
      { id: 'dashboard', icon: '🎓', label: 'Major Detection' },
      { id: 'pathway', icon: '🧭', label: 'Student Pathway' },
    ],
  },
  {
    id: 'import',
    icon: '📥',
    label: 'Study Planners',
    items: [
      { id: 'planners',    icon: '📋', label: 'Study Planners' },
      { id: 'units',    icon: '📝', label: 'Units' },
      { id: 'cloud-sync',  icon: '☁️', label: 'Cloud Sync' },
    ],
  },
  {
    id: 'copilot',
    icon: '🤖',
    label: 'AI Copilot',
    items: [
      { id: 'copilot', icon: '🤖', label: 'AI Copilot' },
    ]
  },
  {
    id: 'analytics',
    icon: '📈',
    label: 'Analytics',
    items: [
      { id: 'class-estimation', icon: '📈', label: 'Class Estimation' },
    ],
  },
];
