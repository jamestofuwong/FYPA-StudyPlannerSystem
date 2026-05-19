'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './layout.module.css';
import TopBar from '../../components/layout/TopBar';
import Sidebar from '../../components/layout/Sidebar';
import TabBar from '../../components/layout/TabBar';
import StatusBar from '../../components/layout/StatusBar';
import PortalLoginModal from '../../components/layout/PortalLoginModal';
import PrivacyNoticeModal from '../../components/privacy/PrivacyNoticeModal';
import UpdateBanner from '../../components/layout/UpdateBanner';
import { ToastProvider } from '../../components/providers/ToastProvider';
import { PortalAuthProvider } from '../../components/providers/PortalAuthContext';
import { ScraperProvider } from '../../components/providers/ScraperContext';
import { panelFromPathname, panelToPath, type PanelId } from '../../lib/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const activePanel = useMemo(() => panelFromPathname(pathname), [pathname]);
  const [openTabs, setOpenTabs] = useState<PanelId[]>([activePanel]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Privacy notice gate
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const presentedAtRef = useRef<Date>(new Date());

  useEffect(() => {
    fetch('/api/privacy/status')
      .then(r => r.json())
      .then((data: { acknowledged: boolean }) => {
        if (!data.acknowledged) {
          presentedAtRef.current = new Date();
          setShowPrivacyModal(true);
        }
        setPrivacyChecked(true);
      })
      .catch(() => {
        // On error, allow app to proceed — don't block the user indefinitely
        setPrivacyChecked(true);
      });
  }, []);

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
          const target = next[Math.min(idx, next.length - 1)];
          setTimeout(() => router.push(panelToPath(target)), 0);
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
    <PortalAuthProvider>
      <ScraperProvider>
      <ToastProvider>
        <div className={styles.shell}>
          <TopBar />
          <UpdateBanner />
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
        <PortalLoginModal />
        {/* Privacy notice — shown above everything until acknowledged */}
        {privacyChecked && showPrivacyModal && (
          <PrivacyNoticeModal
            presentedAt={presentedAtRef.current}
            onAcknowledged={() => setShowPrivacyModal(false)}
          />
        )}
      </ToastProvider>
      </ScraperProvider>
    </PortalAuthProvider>
  );
}
