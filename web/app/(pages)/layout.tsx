'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './layout.module.css';
import TopBar from '../../components/layout/TopBar';
import Sidebar from '../../components/layout/Sidebar';
import TabBar from '../../components/layout/TabBar';
import StatusBar from '../../components/layout/StatusBar';
import { ToastProvider } from '../../components/providers/ToastProvider';
import { panelFromPathname, panelToPath, type PanelId } from '../../lib/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const activePanel = useMemo(() => panelFromPathname(pathname), [pathname]);
  const [openTabs, setOpenTabs] = useState<PanelId[]>([activePanel]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setOpenTabs((prev) => (prev.includes(activePanel) ? prev : [...prev, activePanel]));
  }, [activePanel]);

  const handleNavigate = useCallback(
    (panel: PanelId) => {
      router.push(panelToPath(panel));
    },
    [router]
  );

  const handleCloseTab = useCallback(
    (panel: PanelId) => {
      setOpenTabs((prev) => {
        const idx = prev.indexOf(panel);
        const next = prev.filter((p) => p !== panel);
        if (panel === activePanel && next.length > 0) {
          router.push(panelToPath(next[Math.min(idx, next.length - 1)]));
        }
        return next;
      });
    },
    [activePanel, router]
  );

  const handleReorderTabs = useCallback((reordered: PanelId[]) => {
    setOpenTabs(reordered);
  }, []);

  return (
    <ToastProvider>
      <div className={styles.shell}>
        <TopBar />
        <div className={styles.body}>
          <Sidebar
            activePanel={activePanel}
            onNavigate={handleNavigate}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
          <div className={styles.content}>
            <TabBar
              openTabs={openTabs}
              activePanel={activePanel}
              onNavigate={handleNavigate}
              onCloseTab={handleCloseTab}
              onReorderTabs={handleReorderTabs}
            />
            <div className={styles.panels}>{children}</div>
          </div>
        </div>
        <StatusBar activePanel={activePanel} />
      </div>
    </ToastProvider>
  );
}
