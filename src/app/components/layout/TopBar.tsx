import styles from './TopBar.module.css';

const NAV_ITEMS = ['File', 'Edit', 'View', 'Tools', 'Help'];

export default function TopBar() {
    return (
        <header className={styles.topbar}>
            {/* Logo + App name */}
            <div className={styles.appName}>
                <div className={styles.logo}>S</div>
                SUMS
                <span className={styles.appSubtitle}>· Student Unit Management System</span>
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
                <div className={styles.notifDot} title="2 new notifications" />
                <span className={styles.userEmail}>admin@faculty.edu</span>
                <div className={styles.userAvatar}>JL</div>
            </div>
        </header>
    );
}