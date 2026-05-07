'use client';

import { useState } from 'react';
import styles from './Sidebar.module.css';
import { NAV_SECTIONS, type PanelId } from '../../lib/navigation';

interface SidebarProps {
  activePanel: PanelId;
  onNavigate: (panel: PanelId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({
    activePanel,
    onNavigate,
    isCollapsed,
    onToggleCollapse,
}: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const allItems = NAV_SECTIONS.flatMap((s) => s.items).filter(
        (item) =>
            searchQuery === '' ||
            item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <nav className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
            {/* Header */}
            <div className={styles.sidebarHeader}>
                <span className={styles.explorerLabel}>Explorer</span>
                <button
                    className={styles.collapseBtn}
                    onClick={onToggleCollapse}
                    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {isCollapsed ? '›' : '‹'}
                </button>
            </div>

            {/* Search */}
            <div className={styles.sidebarSearch}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="🔍 Search features..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Nav items */}
            <div className={styles.tree}>
                {allItems.map((item, idx) => (
                    <button
                        key={`${item.id}-${idx}`}
                        className={`${styles.treeItem} ${activePanel === item.id ? styles.active : ''}`}
                        onClick={() => onNavigate(item.id)}
                    >
                        <span className={styles.itemIcon}>{item.icon}</span>
                        <span className={styles.itemLabel}>{item.label}</span>
                        {item.badge !== undefined && (
                            <span className={styles.badge}>{item.badge}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Bottom quick actions */}
            <div className={styles.sidebarActions}>
                <button className={styles.actionItem} onClick={() => onNavigate('user-guide')}>
                    <span className={styles.itemIcon}>📖</span>
                    User Guide
                </button>

                <button className={styles.actionItem} onClick={() => onNavigate('settings')}>
                    <span className={styles.itemIcon}>⚙️</span>
                    Settings
                </button>
            </div>
        </nav>
    );
}
