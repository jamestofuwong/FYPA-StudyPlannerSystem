export type PanelId = 'dashboard' | 'planners' | 'import' | 'export';

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
      { id: 'dashboard', icon: '📋', label: 'Advisory Plan', badge: 3 },
      { id: 'dashboard', icon: '📈', label: 'Unit Progress' },
      { id: 'dashboard', icon: '👥', label: 'All Students', badge: 42 },
    ],
  },
  {
    id: 'planners',
    icon: '📄',
    label: 'Planners',
    items: [
      { id: 'planners', icon: '📋', label: 'View Planners' },
      { id: 'planners', icon: '🔍', label: 'Unit Lookup' },
      { id: 'planners', icon: '⚙️', label: 'Planner Config' },
    ],
  },
  {
    id: 'import',
    icon: '📥',
    label: 'Data Import',
    items: [
      { id: 'import', icon: '📤', label: 'Import PDF Planner' },
      { id: 'import', icon: '🔍', label: 'OCR Processing' },
      { id: 'import', icon: '🕷️', label: 'Portal Scraping' },
      { id: 'import', icon: '✅', label: 'Planner Review' },
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
];