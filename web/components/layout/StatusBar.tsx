'use client';

import { useEffect, useState } from 'react';
import styles from './StatusBar.module.css';
import type { PanelId } from '../../lib/navigation';

const PANEL_LABELS: Record<PanelId, string> = {
    dashboard: 'Dashboard',
    scraping: 'Data Scraping',
    import: 'Data Import',
    export: 'Export',
    student: 'Student',
};

interface StatusBarProps {
    activePanel: PanelId;
}

export default function StatusBar({ activePanel }: StatusBarProps) {
    const [time, setTime] = useState('');

    useEffect(() => {
        function updateClock() {
            setTime(
                new Date().toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                })
            );
        }
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <footer className={styles.statusbar}>
            <div className={styles.sbItem}>
                <span className={styles.sbDot} />
                Connected
            </div>
            <div className={styles.sbItem}>📂 CSF_Planner_2425</div>
            <div className={styles.sbItem}>👥 81 Students</div>
            <div className={styles.sbItem}>📋 {PANEL_LABELS[activePanel]}</div>

            <div className={styles.sbRight}>
                <div className={styles.sbItem}>⚙️ Electron v28</div>
                {time && <div className={styles.sbItem}>{time}</div>}
                <div className={styles.sbItem}>Python OCR Engine Active</div>
            </div>
        </footer>
    );
}
