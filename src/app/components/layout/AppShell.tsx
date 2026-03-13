'use client';

import { useState, useCallback } from 'react';
import styles from './AppShell.module.css';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import StatusBar from './StatusBar';
import { ToastProvider } from './ToastProvider';
import { PanelId } from './NavConfig';
import {
    DashboardPanel,
    ImportPanel,
    ScrapingPanel,
    ExportPanel,
} from './panels';

export default function AppShell() {
    const [openTabs, setOpenTabs] = useState<PanelId[]>(['dashboard']);
    const [activePanel, setActivePanel] = useState<PanelId>('dashboard');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const handleNavigate = useCallback((panel: PanelId) => {
        setOpenTabs((prev) => prev.includes(panel) ? prev : [...prev, panel]);
        setActivePanel(panel);
    }, []);

    const handleCloseTab = useCallback((panel: PanelId) => {
        setOpenTabs((prev) => {
            const idx = prev.indexOf(panel);
            const next = prev.filter((p) => p !== panel);
            if (panel === activePanel && next.length > 0) {
                setActivePanel(next[Math.min(idx, next.length - 1)]);
            }
            return next;
        });
    }, [activePanel]);

    const handleReorderTabs = useCallback((reordered: PanelId[]) => {
        setOpenTabs(reordered);
    }, []);

    function renderPanel() {
        switch (activePanel) {
            case 'dashboard': return <DashboardPanel />;
            case 'import': return <ImportPanel />;
            case 'scraping': return <ScrapingPanel />;
            case 'export': return <ExportPanel />;
            default: return <DashboardPanel />;
        }
    }

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
                        <div className={styles.panels}>{renderPanel()}</div>
                    </div>
                </div>
                <StatusBar activePanel={activePanel} />
            </div>
        </ToastProvider>
    );
}


