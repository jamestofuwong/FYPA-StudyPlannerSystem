'use client';

import styles from './TabBar.module.css';
import { PanelId } from './NavConfig';

interface Tab {
    id: PanelId;
    icon: string;
    label: string;
}

const TABS: Tab[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'planners', icon: '📄', label: 'Planners' },
    { id: 'import', icon: '📥', label: 'Data Import' },
    { id: 'export', icon: '📤', label: 'Export' },
];

interface TabBarProps {
    activePanel: PanelId;
    onNavigate: (panel: PanelId) => void;
}

export default function TabBar({ activePanel, onNavigate }: TabBarProps) {
    return (
        <div className={styles.tabBar} role="tablist">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activePanel === tab.id}
                    className={`${styles.tab} ${activePanel === tab.id ? styles.active : ''}`}
                    onClick={() => onNavigate(tab.id)}
                >
                    <span className={styles.tabIcon}>{tab.icon}</span>
                    <span className={styles.tabLabel}>{tab.label}</span>
                    <span className={styles.tabClose} aria-hidden="true">
                        ×
                    </span>
                </button>
            ))}
        </div>
    );
}