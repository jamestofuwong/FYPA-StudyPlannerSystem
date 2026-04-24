'use client';

import { useRef } from 'react';
import styles from './TabBar.module.css';
import type { PanelId } from '../../lib/navigation';
import { useEffect, useState } from 'react';

interface TabMeta {
    id: PanelId;
    icon: string;
    label: string;
}

const TAB_META: Record<PanelId, TabMeta> = {
    dashboard: { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    import: { id: 'import', icon: '📥', label: 'Data Import' },
    scraping: { id: 'scraping', icon: '🕷️', label: 'Data Scraping' },
    planners: { id: 'planners', icon: '✅', label: 'Study Planners' },
};

interface TabBarProps {
    openTabs: PanelId[];
    activePanel: PanelId;
    onNavigate: (panel: PanelId) => void;
    onCloseTab: (panel: PanelId) => void;
    onReorderTabs: (reordered: PanelId[]) => void;
}

export default function TabBar({
    openTabs,
    activePanel,
    onNavigate,
    onCloseTab,
    onReorderTabs,
}: TabBarProps) {
    const dragSrc = useRef<PanelId | null>(null);

    function handleDragStart(panel: PanelId) {
        dragSrc.current = panel;
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault(); // required to allow drop
    }

    function handleDrop(targetPanel: PanelId) {
        if (!dragSrc.current || dragSrc.current === targetPanel) return;
        const src = dragSrc.current;
        const reordered = [...openTabs];
        const fromIdx = reordered.indexOf(src);
        const toIdx = reordered.indexOf(targetPanel);
        reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, src);
        onReorderTabs(reordered);
        dragSrc.current = null;
    }

    function handleCloseClick(e: React.MouseEvent, panel: PanelId) {
        e.stopPropagation(); // don't trigger onNavigate
        onCloseTab(panel);
    }

    return (
        <div className={styles.tabBar} role="tablist">
            {openTabs.map((id) => {
                const tab = TAB_META[id];
                return (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={activePanel === id}
                        draggable
                        className={`${styles.tab} ${activePanel === id ? styles.active : ''}`}
                        onClick={() => onNavigate(id)}
                        onDragStart={() => handleDragStart(id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(id)}
                    >
                        <span className={styles.tabIcon}>{tab.icon}</span>
                        <span className={styles.tabLabel}>{tab.label}</span>
                        <span
                            className={styles.tabClose}
                            aria-label={`Close ${tab.label}`}
                            onClick={(e) => handleCloseClick(e, id)}
                        >
                            ×
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
