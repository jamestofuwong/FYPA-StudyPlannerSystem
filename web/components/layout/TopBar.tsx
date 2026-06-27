'use client';

import { useState } from 'react';
import styles from './TopBar.module.css';
import { usePortalAuth } from '../providers/PortalAuthContext';
import AgentChat from '../AgentChat';

export default function TopBar() {
  const { isLoggedIn, isPortalLoading, openLoginModal, resetSession } = usePortalAuth();
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  return (
    <>
      <header className={styles.topbar}>
        {/* Logo + App name */}
        <div className={styles.appName}>
          <div className={styles.logo}>S</div>
          <span className={styles.appSubtitle}>Study Planner System</span>
        </div>

        <div className={styles.spacer} />

        {/* Agent toggle button */}
        <button
          className={`${styles.agentBtn} ${isAgentOpen ? styles.agentBtnActive : ''}`}
          onClick={() => setIsAgentOpen((v) => !v)}
          title="AI Advisor Agent"
        >
          Agent
        </button>

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

      <AgentChat isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
    </>
  );
}
