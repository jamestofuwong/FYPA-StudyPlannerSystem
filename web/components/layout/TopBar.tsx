'use client';

import styles from './TopBar.module.css';
import { usePortalAuth } from '../providers/PortalAuthContext';

const NAV_ITEMS = ['File', 'Edit', 'View', 'Tools', 'Help'];

export default function TopBar() {
  const { isLoggedIn, isPortalLoading, openLoginModal, resetSession } = usePortalAuth();

  return (
    <header className={styles.topbar}>
      {/* Logo + App name */}
      <div className={styles.appName}>
        <div className={styles.logo}>S</div>
        SPS
        <span className={styles.appSubtitle}>· Study Planner System</span>
      </div>

      {/* Menu bar */}
      <nav className={styles.navMenu}>
        {NAV_ITEMS.map((item) => (
          <button key={item} className={styles.navItem}>
            {item}
          </button>
        ))}
      </nav>

      <div className={styles.spacer} />

      {/* User info */}
      <div className={styles.userInfo}>
        {isPortalLoading ? (
          <div className={styles.loadingBtn}>
            <div className={styles.spinner} />
            Logging in...
          </div>
        ) : isLoggedIn ? (
          <button className={styles.logoutBtn} onClick={resetSession}>
            Log out
          </button>
        ) : (
          <button className={styles.loginBtn} onClick={openLoginModal}>
            Log in to Portal
          </button>
        )}
      </div>
    </header>
  );
}
