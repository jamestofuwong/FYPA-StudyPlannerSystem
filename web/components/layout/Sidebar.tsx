'use client';

import { GraduationCap, LogIn, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import styles from './Sidebar.module.css';
import { NAV_SECTIONS, type PanelId } from '../../lib/navigation';
import { PANEL_ICONS } from '../../lib/panelIcons';
import { useDesign } from '../../styles/themeProvider';
import { usePortalSession } from './usePortalSession';

interface SidebarProps {
  activePanel: PanelId;
  onNavigate: (panel: PanelId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar(props: SidebarProps) {
    const design = useDesign();
    return design === 'meadow' ? <MeadowSidebar {...props} /> : <ClassicSidebar {...props} />;
}

function ClassicSidebar({
    activePanel,
    onNavigate,
    isCollapsed,
    onToggleCollapse,
}: SidebarProps) {
    const allItems = NAV_SECTIONS.flatMap((s) => s.items);

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

// Plain-language group names for the Meadow sidebar, keyed by NAV_SECTIONS id.
const MEADOW_GROUP_LABELS: Record<string, string> = {
    main: 'Advising',
    import: 'Course data',
    copilot: 'Assistant',
    analytics: 'Reports',
};

const PORTAL_STATUS_TITLE = {
    idle: 'Portal not connected',
    'login-pending': 'Connecting to portal…',
    'logged-in': 'Portal connected',
    'login-error': 'Portal login failed',
} as const;

// Meadow layout: brand header, grouped navigation with line icons, and the
// portal session (moved here from the classic top bar) above help and settings.
function MeadowSidebar({
    activePanel,
    onNavigate,
    isCollapsed,
    onToggleCollapse,
}: SidebarProps) {
    const { sessionStatus, login, logout } = usePortalSession();
    const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

    const navButton = (id: PanelId, label: string) => {
        const Icon = PANEL_ICONS[id];
        const active = activePanel === id;
        return (
            <button
                key={id}
                className={`${styles.mItem} ${active ? styles.mItemActive : ''}`}
                onClick={() => onNavigate(id)}
                aria-current={active ? 'page' : undefined}
                title={isCollapsed ? label : undefined}
            >
                <Icon className={styles.mItemIcon} aria-hidden="true" />
                <span className={styles.mItemLabel}>{label}</span>
            </button>
        );
    };

    return (
        <nav className={`${styles.mSidebar} ${isCollapsed ? styles.mCollapsed : ''}`} aria-label="Main">
            <div className={styles.mBrand}>
                <span className={styles.mLogo} aria-hidden="true">
                    <GraduationCap />
                </span>
                <span className={styles.mBrandText}>
                    <span className={styles.mBrandName}>Study Planner</span>
                    <span className={styles.mBrandSub}>Advisor workspace</span>
                </span>
                <button
                    className={styles.mCollapseBtn}
                    onClick={onToggleCollapse}
                    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <ToggleIcon aria-hidden="true" />
                </button>
            </div>

            <div className={styles.mGroups}>
                {NAV_SECTIONS.map((section) => (
                    <div key={section.id} className={styles.mGroup}>
                        <span className={styles.mGroupLabel}>{MEADOW_GROUP_LABELS[section.id] ?? section.label}</span>
                        {section.items.map((item) => navButton(item.id, item.label))}
                    </div>
                ))}
            </div>

            <div className={styles.mFooter}>
                <div className={styles.mPortal}>
                    <div className={styles.mPortalHead}>
                        <span
                            className={`${styles.mPortalDot} ${sessionStatus === 'logged-in' ? styles.mPortalDotOn : ''} ${sessionStatus === 'login-pending' ? styles.mPortalDotPending : ''}`}
                            aria-hidden="true"
                        />
                        <span className={styles.mPortalTitle}>{PORTAL_STATUS_TITLE[sessionStatus]}</span>
                    </div>
                    {sessionStatus === 'login-pending' ? (
                        <span className={styles.mPortalPending}>Logging in…</span>
                    ) : sessionStatus === 'logged-in' ? (
                        <button className={styles.mPortalBtn} onClick={logout} title={isCollapsed ? 'Log out' : undefined}>
                            <LogOut aria-hidden="true" />
                            <span className={styles.mPortalBtnLabel}>Log out</span>
                        </button>
                    ) : (
                        <button className={`${styles.mPortalBtn} ${styles.mPortalBtnPrimary}`} onClick={login} title={isCollapsed ? 'Log in to Portal' : undefined}>
                            <LogIn aria-hidden="true" />
                            <span className={styles.mPortalBtnLabel}>Log in to Portal</span>
                        </button>
                    )}
                </div>
                {navButton('user-guide', 'User Guide')}
                {navButton('settings', 'Settings')}
            </div>
        </nav>
    );
}
