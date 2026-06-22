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

  // DB readiness gate (Electron only — browser dev skips this)
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const api = (window as any).dbAPI;
    if (!api) {
      // Running in browser (dev mode) — no embedded DB, proceed immediately
      setDbReady(true);
      return;
    }
    api.isReady().then((ready: boolean) => {
      if (ready) {
        setDbReady(true);
      } else {
        api.onReady(() => setDbReady(true));
      }
    });
  }, []);

  // Shutdown overlay state
  const [shuttingDown, setShuttingDown] = useState(false);
  const [shutdownDone, setShutdownDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const api = (window as any).shutdownAPI;
    if (!api) return;
    api.onShuttingDown(() => setShuttingDown(true));
    api.onProgress((data: { service: string; done: boolean }) => {
      setShutdownDone((prev) => ({ ...prev, [data.service]: data.done }));
    });
  }, []);

  // Privacy notice gate
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const presentedAtRef = useRef<Date>(new Date());

  useEffect(() => {
    if (!dbReady) return;
    fetch('/api/privacy/status')
      .then(r => {
        if (!r.ok) throw new Error('not-ok');
        return r.json();
      })
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
  }, [dbReady]);

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
        {/* Shutdown overlay — shown while services are stopping */}
        {shuttingDown && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'var(--bg-base, #1e1e1e)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted, #858585)', marginBottom: 4 }}>
              Shutting down…
            </div>
            <div style={{ width: 160, height: 3, background: 'var(--border, #333)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: '40%', height: '100%', background: 'var(--accent-blue, #569cd6)', borderRadius: 2,
                animation: 'db-pulse 1.2s ease-in-out infinite alternate' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {[
                { key: 'server',   label: 'Web server' },
                { key: 'database', label: 'Database' },
                { key: 'ollama',   label: 'AI engine' },
              ].map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-muted, #858585)' }}>
                  {shutdownDone[key]
                    ? <span style={{ color: 'var(--accent-green, #4ec9b0)', fontSize: 11 }}>✓</span>
                    : <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent-blue, #569cd6)',
                        borderTopColor: 'transparent', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite' }} />
                  }
                  {label}
                </div>
              ))}
            </div>
            <style>{`
              @keyframes db-pulse { from { margin-left: 0 } to { margin-left: 60% } }
              @keyframes spin { to { transform: rotate(360deg) } }
            `}</style>
          </div>
        )}
        {/* DB startup overlay — shown on Windows/first-run while Postgres initialises */}
        {!dbReady && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--bg-base, #1e1e1e)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12,
          }}>
            <div style={{ fontSize: 13, color: 'var(--fg-muted, #858585)' }}>Starting database…</div>
            <div style={{ width: 160, height: 3, background: 'var(--border, #333)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: '40%', height: '100%', background: 'var(--accent-blue, #569cd6)', borderRadius: 2,
                animation: 'db-pulse 1.2s ease-in-out infinite alternate' }} />
            </div>
          </div>
        )}
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
