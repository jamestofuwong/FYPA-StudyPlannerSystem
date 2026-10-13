import {
  BookOpen,
  ChartColumn,
  CircleHelp,
  CloudDownload,
  FileUp,
  Globe,
  GraduationCap,
  Layers,
  MessageCircle,
  Route,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { PanelId } from './navigation';

// Line icons the Meadow design shows in place of the classic emoji icons.
export const PANEL_ICONS: Record<PanelId, LucideIcon> = {
  dashboard: GraduationCap,
  pathway: Route,
  import: FileUp,
  scraping: Globe,
  planners: Layers,
  units: BookOpen,
  'cloud-sync': CloudDownload,
  settings: Settings,
  'user-guide': CircleHelp,
  copilot: MessageCircle,
  'class-estimation': ChartColumn,
};
