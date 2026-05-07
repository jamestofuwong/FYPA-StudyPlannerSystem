export type PanelId = 'dashboard' | 'import' | 'scraping' | 'planners' | 'settings' | 'user-guide';

export const PANEL_IDS: PanelId[] = ['dashboard', 'import', 'scraping', 'planners', 'settings', 'user-guide'];

export function isPanelId(value: string): value is PanelId {
  return (PANEL_IDS as string[]).includes(value);
}

export const PANEL_PATHS: Record<PanelId, string> = {
  dashboard: '/dashboard',
  import: '/import',
  scraping: '/scraping',
  planners: '/planners',
  settings: '/settings',
    'user-guide': '/user-guide',
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
    ],
  },
  {
    id: 'import',
    icon: '📥',
    label: 'Study Planners',
    items: [
      { id: 'planners', icon: '📋', label: 'Study Planners' },
    ],
  },
  {
    id: 'scraping',
    icon: '🕷️',
    label: 'Scraping Bot',
    items: [
      { id: 'scraping', icon: '🕷️', label: 'Scraping Bot' },
    ],
  },
];
