'use client';
 
import { useState } from 'react';
import styles from './Sidebar.module.css';
import { NAV_SECTIONS, PanelId } from './NavConfig';
 
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

    // Track which sections are open; default: all open except last
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        main: true,
        planners: true,
        import: true,
        export: true,
    });

    const [searchQuery, setSearchQuery] = useState('');

    function toggleSection(sectionId: string) {
        setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
    }

    // Filter items by search query
    const filteredSections = NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) =>
            searchQuery === '' ||
            item.label.toLowerCase().includes(searchQuery.toLowerCase())
        ),
    })).filter((section) => searchQuery === '' || section.items.length > 0);

    return (
        <nav className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
            {/* Header */}
            <div className={styles.sidebarHeader}>
                <span>Explorer</span>
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

            {/* Tree */}
            <div className={styles.tree}>
                {filteredSections.map((section) => {
                    const isOpen = openSections[section.id] ?? true;

                    return (
                        <div key={section.id}>
                            {/* Section header */}
                            <button
                                className={styles.sectionHeader}
                                onClick={() => toggleSection(section.id)}
                            >
                                <span
                                    className={`${styles.chevron} ${!isOpen ? styles.chevronCollapsed : ''}`}
                                >
                                    ▾
                                </span>
                                <span className={styles.sectionIcon}>{section.icon}</span>
                                {section.label}
                            </button>

                            {/* Section children */}
                            <div
                                className={`${styles.treeChildren} ${!isOpen ? styles.treeChildrenCollapsed : ''}`}
                            >
                                {section.items.map((item, idx) => (
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
                        </div>
                    );
                })}
            </div>

            {/* Bottom quick actions */}
            <div className={styles.sidebarActions}>
                <button className={styles.actionItem} onClick={() => onNavigate('import')}>
                    <span className={styles.itemIcon}>🔄</span>
                    Sync Portal Data
                </button>
                <button className={styles.actionItem} onClick={() => onNavigate('export')}>
                    <span className={styles.itemIcon}>💾</span>
                    Quick Export
                </button>
            </div>
        </nav>
    );
}