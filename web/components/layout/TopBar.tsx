'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './TopBar.module.css';

type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';

export default function TopBar() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');

  // Poll portal session status every 2s
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper/status');
      if (!res.ok) return;
      const data = await res.json();
      setSessionStatus(data.sessionStatus ?? 'idle');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(fetchStatus, 2000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleLogin = async () => {
    await fetch('/api/scraper/login', { method: 'POST' });
    setSessionStatus('login-pending');
  };

  const handleLogout = async () => {
    await fetch('/api/scraper/logout', { method: 'POST' });
    setSessionStatus('idle');
  };

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
