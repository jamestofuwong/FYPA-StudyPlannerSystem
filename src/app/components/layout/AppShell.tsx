'use client';

import { useState } from 'react';
import styles from './AppShell.module.css';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import StatusBar from './StatusBar';
import { PanelId } from './NavConfig';
import {
    DashboardPanel,
    PlannersPanel,
    ImportPanel,
    ExportPanel,
} from './panels';

export default function AppShell() {
    return (
        <div className={styles.shell}>
            {/* Top menu bar */}
            <TopBar />
        </div>
    );
}