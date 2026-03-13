'use client';

import styles from './shared.module.css';

export default function ScrapingPanel() {
    return (
        <div className={styles.panel}>
            <div className={styles.sectionTitle}>Student Portal Data Scraping</div>

            <div className={styles.splitLayout}>
                <div className={styles.splitMain}>

                    <div className={styles.card}>
                        <div className={styles.cardTitle}>Portal Authentication</div>
                        <div style={{ background: '#1a1a1a', border: '1px solid var(--panel-border)', borderRadius: 4, padding: 14, marginBottom: 14 }}>
                            <div className={styles.formGrid2}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Portal URL</label>
                                    <input className={`${styles.formInput} ${styles.formInputMono}`} defaultValue="https://siswa.unimas.my/portal" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Admin Username</label>
                                    <input className={`${styles.formInput} ${styles.formInputMono}`} defaultValue="admin_faculty_csf" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Password</label>
                                    <input type="password" className={`${styles.formInput} ${styles.formInputPassword}`} defaultValue="adminpassword123" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Session Timeout (seconds)</label>
                                    <input className={`${styles.formInput} ${styles.formInputMono}`} defaultValue="300" />
                                </div>
                            </div>
                            <div className={styles.btnGroup}>
                                <button className={styles.btnPrimary}>🔌 Test Connection</button>
                                <button className={styles.btnSecondary}>💾 Save Credentials</button>
                            </div>
                        </div>

                        <div className={styles.cardTitle} style={{ marginTop: 4 }}>Scraping Configuration</div>
                        <div className={styles.formGrid2}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Academic Year</label>
                                <select className={styles.formSelect}><option>2024/2025</option><option>2023/2024</option></select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Semester</label>
                                <select className={styles.formSelect}><option>Semester 2</option><option>Semester 1</option></select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Faculty / Programme</label>
                                <select className={styles.formSelect}><option>All</option><option>Computer Science</option><option>Software Engineering</option></select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Scrape Mode</label>
                                <select className={styles.formSelect}><option>Full Scrape</option><option>Delta (New Only)</option><option>Specific Cohort</option></select>
                            </div>
                        </div>
                        <div className={styles.btnGroup}>
                            <button className={styles.btnPrimary}>🕷️ Scrape Student Data</button>
                            <button className={styles.btnSuccess}>⏰ Schedule Scrape</button>
                            <button className={styles.btnDanger}>⛔ Stop</button>
                        </div>
                    </div>

                    {/* Scrape log */}
                    <div className={styles.sectionTitle}>Scrape Log</div>
                    <div style={{
                        background: '#0d0d0d', border: '1px solid var(--panel-border)', borderRadius: 4,
                        padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11,
                        height: 130, overflowY: 'auto', marginBottom: 16,
                    }}>
                        {[
                            { cls: 'info', msg: '[2025-03-01 10:42:01] INFO: Scraping session initialized' },
                            { cls: '', msg: '[2025-03-01 10:42:03] OK: Portal connection established' },
                            { cls: '', msg: '[2025-03-01 10:42:05] OK: Authenticated as admin_faculty_csf' },
                            { cls: 'info', msg: '[2025-03-01 10:42:06] INFO: Starting student list traversal...' },
                            { cls: '', msg: '[2025-03-01 10:42:08] OK: Fetched cohort 2021 — 28 records' },
                            { cls: '', msg: '[2025-03-01 10:42:10] OK: Fetched cohort 2022 — 34 records' },
                            { cls: 'warn', msg: '[2025-03-01 10:42:12] WARN: Cohort 2023 — rate-limited, retrying in 3s' },
                            { cls: '', msg: '[2025-03-01 10:42:15] OK: Fetched cohort 2023 — 19 records' },
                            { cls: 'info', msg: '[2025-03-01 10:42:19] INFO: Scrape completed. 81 students | 1,742 records' },
                        ].map((l, i) => (
                            <div key={i} style={{ marginBottom: 3, color: l.cls === 'info' ? 'var(--accent-blue)' : l.cls === 'warn' ? 'var(--accent-yellow)' : 'var(--accent-green)' }}>
                                {l.msg}
                            </div>
                        ))}
                    </div>

                    {/* Imported students table */}
                    <div className={styles.sectionTitle}>Imported Students (Scraped)</div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>Student ID</th><th>Full Name</th><th>Programme</th><th>Year</th><th>Units</th><th>GPA</th><th>Scraped At</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {[
                                    { id: 'CS2021-0042', name: 'James Teck Hock WONG', prog: 'CSF', yr: 3, units: 24, gpa: 3.42, at: '01-Mar 10:42', s: 'OK', sc: 'badgeGreen' },
                                    { id: 'CS2021-0018', name: 'Nur Fariha binti Azman', prog: 'CSF', yr: 3, units: 27, gpa: 3.76, at: '01-Mar 10:42', s: 'OK', sc: 'badgeGreen' },
                                    { id: 'CS2022-0031', name: 'Liang Wei Jun', prog: 'CSF', yr: 2, units: 16, gpa: 3.58, at: '01-Mar 10:42', s: 'OK', sc: 'badgeGreen' },
                                    { id: 'CS2020-0007', name: 'Priya d/o Krishnan', prog: 'CSF', yr: 4, units: 31, gpa: 2.81, at: '01-Mar 10:42', s: 'Warn', sc: 'badgeOrange' },
                                    { id: 'CS2022-0055', name: 'Muhammad Hafiz bin Ramli', prog: 'SE', yr: 2, units: 15, gpa: 3.10, at: '01-Mar 10:42', s: 'OK', sc: 'badgeGreen' },
                                    { id: 'CS2021-0066', name: 'Sarah Tan Mei Lin', prog: 'SE', yr: 3, units: 26, gpa: 3.89, at: '01-Mar 10:42', s: 'OK', sc: 'badgeGreen' },
                                    { id: 'CS2023-0004', name: 'Raj Kumar s/o Suresh', prog: 'IS', yr: 1, units: 8, gpa: 3.20, at: '01-Mar 10:42', s: 'OK', sc: 'badgeGreen' },
                                ].map((r) => (
                                    <tr key={r.id}>
                                        <td><code className={styles.code}>{r.id}</code></td>
                                        <td>{r.name}</td>
                                        <td>{r.prog}</td>
                                        <td>{r.yr}</td>
                                        <td>{r.units}</td>
                                        <td>{r.gpa}</td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{r.at}</td>
                                        <td><span className={`${styles.badge} ${styles[r.sc as keyof typeof styles]}`}>{r.s}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right side */}
                <div className={styles.splitSide}>
                    <div className={styles.sectionTitle}>Scraping Stats</div>
                    <div className={styles.card}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Students Scraped', value: '81', sub: 'across 3 cohorts', cls: 'blue' },
                                { label: 'Enrollment Records', value: '1,742', sub: 'unique unit enrollments', cls: 'green' },
                                { label: 'Last Sync', value: 'Today', sub: '10:42 AM · Auto-sync enabled', cls: 'yellow' },
                            ].map((s) => (
                                <div key={s.label} className={`${styles.statCard} ${styles[s.cls as keyof typeof styles]}`} style={{ margin: 0 }}>
                                    <div className={styles.statLabel}>{s.label}</div>
                                    <div className={styles.statValue} style={s.label === 'Last Sync' ? { fontSize: 18 } : {}}>{s.value}</div>
                                    <div className={styles.statSub}>{s.sub}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.sectionTitle}>Portal Status</div>
                    <div className={styles.card}>
                        {[
                            { label: 'Connection', badge: '● Live', badgeCls: 'badgeGreen' },
                            { label: 'Response Time', value: '142ms' },
                            { label: 'Rate Limit', value: '47 / 60 req/min' },
                            { label: 'Auto-Sync', badge: 'Enabled', badgeCls: 'badgeBlue' },
                        ].map((r) => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
                                <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                                {r.badge
                                    ? <span className={`${styles.badge} ${styles[r.badgeCls as keyof typeof styles]}`}>{r.badge}</span>
                                    : <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>{r.value}</span>
                                }
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}