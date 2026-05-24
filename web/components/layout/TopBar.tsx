'use client';

import styles from './TopBar.module.css';

export default function TopBar() {
  return (
    <header className={styles.topbar}>
      {/* Logo + App name */}
      <div className={styles.appName}>
        <div className={styles.logo}>S</div>
        SPS
        <span className={styles.appSubtitle}>· Study Planner System</span>
      </div>
    </header>
  );
}
