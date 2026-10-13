'use client';

import styles from './TopBar.module.css';
import { usePortalSession } from './usePortalSession';

export default function TopBar() {
  // Polls the portal session status every 2s
  const { sessionStatus, login: handleLogin, logout: handleLogout } = usePortalSession();

  return (
    <header className={styles.topbar}>
      {/* Logo + App name */}
      <div className={styles.appName}>
        <div className={styles.logo}>S</div>
        <span className={styles.appSubtitle}>Study Planner System</span>
      </div>

      <div className={styles.spacer} />

      {/* Portal session */}
      <div className={styles.userInfo}>
        {sessionStatus === 'login-pending' ? (
          <div className={styles.loadingBtn}>
            <div className={styles.spinner} />
            Logging in...
          </div>
        ) : sessionStatus === 'logged-in' ? (
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Log out
          </button>
        ) : (
          <button className={styles.loginBtn} onClick={handleLogin}>
            Log in to Portal
          </button>
        )}
      </div>
    </header>
  );
}
