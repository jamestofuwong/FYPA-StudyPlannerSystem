'use client';

import { useState } from 'react';
import styles from './AppShell.module.css';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import { PanelId } from './NavConfig';
import {
    DashboardPanel,
    PlannersPanel,
    ImportPanel,
    ExportPanel,
} from './panels';

export default function AppShell() {
    const [activePanel, setActivePanel] = useState<PanelId>('dashboard');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    function renderPanel() {
        switch (activePanel) {
            case 'dashboard':
                return <DashboardPanel />;
            case 'planners':
                return <PlannersPanel />;
            case 'import':
                return <ImportPanel />;
            case 'export':
                return <ExportPanel />;
            default:
                return <DashboardPanel />;
        }
    }

    return (
        <div className={styles.shell}>
            {/* Top menu bar */}
            <TopBar />

            {/* Main body: sidebar + content */}
            <div className={styles.body}>
                <Sidebar
                    activePanel={activePanel}
                    onNavigate={setActivePanel}
                    isCollapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
                />
            </div>
        </div>
    );
}