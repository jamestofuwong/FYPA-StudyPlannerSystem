export type PanelId = 'dashboard' | 'import' | 'scraping' | 'export' | 'student' | 'planners';

export const PANEL_IDS: PanelId[] = ['dashboard', 'import', 'scraping', 'export', 'student', 'planners'];

export function isPanelId(value: string): value is PanelId {
  return (PANEL_IDS as string[]).includes(value);
}

export const PANEL_PATHS: Record<PanelId, string> = {
  dashboard: '/dashboard',
  import: '/import',
  scraping: '/scraping',
  export: '/export',
  student: '/student',
  planners: '/planners',
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
    label: 'Dashboard',
    items: [
      { id: 'dashboard', icon: '🎓', label: 'Major Detection' },
      { id: 'dashboard', icon: '📋', label: 'Advisory Plan' },
      { id: 'dashboard', icon: '📈', label: 'Unit Progress' },
      { id: 'dashboard', icon: '👥', label: 'All Students' },
    ],
  },
  {
    id: 'import',
    icon: '📥',
    label: 'Data Import',
    items: [
      { id: 'import', icon: '📤', label: 'Import PDF Planner' },
      { id: 'import', icon: '🔍', label: 'OCR Processing' },
      { id: 'planners', icon: '✅', label: 'Planner Review' },
    ],
  },
  {
    id: 'scraping',
    icon: '🕷️',
    label: 'Data Scraping',
    items: [
      { id: 'scraping', icon: '🔐', label: 'Portal Login' },
      { id: 'scraping', icon: '⚙️', label: 'Scraping Config' },
      { id: 'scraping', icon: '📥', label: 'Imported Students' },
    ],
  },
  {
    id: 'export',
    icon: '📤',
    label: 'Export',
    items: [
      { id: 'export', icon: '📊', label: 'Export Reports' },
      { id: 'export', icon: '📅', label: 'Schedule Export' },
      { id: 'export', icon: '🗂️', label: 'Export History' },
    ],
  },
  {
    id: 'student',
    icon: '👩‍🎓',
    label: 'Student',
    items: [{ id: 'student', icon: '📊', label: 'Student View' }],
  },
];
