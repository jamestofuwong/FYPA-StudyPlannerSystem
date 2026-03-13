'use client';

import styles from './shared.module.css';

export default function DashboardPanel() {
    return (
        <div className={styles.panel}>

            {/* Student selector */}
            <div className={styles.studentBar}>
                <div className={styles.avatar}>AH</div>
                <div>
                    <div className={styles.studentName}>James Teck Hock WONG</div>
                    <div className={styles.studentMeta}>Student ID: 102789084 · Year 3 Sem 2 · CSF Faculty</div>
                </div>
                <select className={styles.studentSelect}>
                    <option>James Teck Hock WONG</option>
                    <option>Teck Hock WONG</option>
                    <option>James Benedict WONG</option>
                </select>
            </div>

            {/* Stat cards */}
            <div className={styles.statGrid}>
                <div className={`${styles.statCard} ${styles.blue}`}>
                    <div className={styles.statLabel}>Units Completed</div>
                    <div className={styles.statValue}>24</div>
                    <div className={styles.statSub}>of 40 total required</div>
                </div>
                <div className={`${styles.statCard} ${styles.green}`}>
                    <div className={styles.statLabel}>Major Match</div>
                    <div className={styles.statValue}>87%</div>
                    <div className={styles.statSub}>Software Engineering</div>
                </div>
                <div className={`${styles.statCard} ${styles.yellow}`}>
                    <div className={styles.statLabel}>Current GPA</div>
                    <div className={styles.statValue}>3.42</div>
                    <div className={styles.statSub}>Above Faculty Average</div>
                </div>
                <div className={`${styles.statCard} ${styles.orange}`}>
                    <div className={styles.statLabel}>Missing Units</div>
                    <div className={styles.statValue}>5</div>
                    <div className={styles.statSub}>3 critical, 2 electives</div>
                </div>
            </div>

            <div className={styles.splitLayout}>
                <div className={styles.splitMain}>

                    {/* Detected major */}
                    <div className={styles.majorCard}>
                        <div className={styles.majorIcon}>🎓</div>
                        <div className={styles.majorInfo}>
                            <div className={styles.majorLabel}>Detected Primary Major</div>
                            <div className={styles.majorName}>Software Engineering</div>
                            <div className={styles.majorConf}>
                                <span>87% confidence</span>
                                <span className={`${styles.badge} ${styles.badgeGreen}`}>HIGH MATCH</span>
                            </div>
                        </div>
                        <div className={styles.majorActions}>
                            <button className={styles.btnPrimary}>Generate Plan</button>
                            <button className={styles.btnSecondary}>View Details</button>
                        </div>
                    </div>

                    {/* Possible majors */}
                    <div className={styles.sectionTitle}>Possible Majors / Second Majors</div>
                    {[
                        { rank: '1st', name: 'Software Engineering', pct: 87, color: '#569cd6', badge: 'Primary', badgeClass: 'badgeGreen' },
                        { rank: '2nd', name: 'Information Systems', pct: 74, color: '#4ec9b0', badge: '2nd Major', badgeClass: 'badgeBlue' },
                        { rank: '3rd', name: 'Computer Networks', pct: 58, color: '#dcdcaa', badge: 'Partial', badgeClass: 'badgeOrange' },
                        { rank: '4th', name: 'Data Science', pct: 43, color: '#ce9178', badge: 'Low', badgeClass: 'badgeRed' },
                    ].map((m) => (
                        <div key={m.rank} className={styles.majorRow}>
                            <span className={`${styles.badge} ${styles.badgeBlue}`}>{m.rank}</span>
                            <span className={styles.majorRowName}>{m.name}</span>
                            <div className={styles.progressWrap}>
                                <div className={styles.progressBar} style={{ width: `${m.pct}%`, background: m.color }} />
                            </div>
                            <span className={styles.majorRowPct}>{m.pct}%</span>
                            <span className={`${styles.badge} ${styles[m.badgeClass as keyof typeof styles]}`}>{m.badge}</span>
                        </div>
                    ))}

                    {/* Advisory plan */}
                    <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Advisory Plan</div>
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <span className={styles.cardTitle}>Recommended Enrollment Path</span>
                            <div className={styles.btnGroup}>
                                <button className={styles.btnSuccess}>📊 Export</button>
                                <button className={styles.btnSecondary}>🔄 Recalculate</button>
                            </div>
                        </div>
                        <div className={styles.legend}>
                            <span><span className={styles.suDone}>■</span> Completed</span>
                            <span><span className={styles.suPending}>■</span> Enrolled</span>
                            <span><span className={styles.suMissing}>■</span> Missing</span>
                            <span><span className={styles.suAlt}>■</span> Alternative</span>
                        </div>
                        {[
                            { sem: 'Y1 Sem 1', units: [['done', 'CSF1101'], ['done', 'CSF1102'], ['done', 'MTH1101'], ['done', 'CSF1201']] },
                            { sem: 'Y1 Sem 2', units: [['done', 'CSF1103'], ['done', 'CSF1104'], ['done', 'MTH1201'], ['done', 'CSF1202']] },
                            { sem: 'Y2 Sem 1', units: [['done', 'CSF2101'], ['done', 'CSF2102'], ['done', 'CSF2103'], ['missing', 'CSF2104 ⚠']] },
                            { sem: 'Y2 Sem 2', units: [['done', 'CSF2201'], ['done', 'CSF2202'], ['missing', 'CSF2203 ⚠'], ['alt', 'CSF2205 ↔']] },
                            { sem: 'Y3 Sem 1', units: [['done', 'CSF3101'], ['done', 'CSF3102'], ['pending', 'CSF3103'], ['pending', 'CSF3104']] },
                            { sem: 'Y3 Sem 2', units: [['pending', 'CSF3201'], ['missing', 'CSF3202 ⚠'], ['pending', 'CSF3203'], ['pending', 'CSF3FYP']] },
                        ].map((row) => (
                            <div key={row.sem} className={styles.advisoryStep}>
                                <div className={styles.stepSem}>{row.sem}</div>
                                <div className={styles.stepUnits}>
                                    {row.units.map(([type, code]) => (
                                        <span key={code} className={`${styles.stepUnit} ${styles['su' + type.charAt(0).toUpperCase() + type.slice(1)]}`}>{code}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Missing units table */}
                    <div className={styles.sectionTitle}>Missing Critical Units</div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>Unit Code</th><th>Unit Name</th><th>Credit Hours</th><th>Type</th><th>Prerequisite</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {[
                                    { code: 'CSF2104', name: 'Algorithm Design & Analysis', cr: 3, type: 'Core', pre: 'CSF1103', status: 'Missing', sc: 'badgeRed' },
                                    { code: 'CSF2203', name: 'Database Systems II', cr: 3, type: 'Core', pre: 'CSF2201', status: 'Missing', sc: 'badgeRed' },
                                    { code: 'CSF3202', name: 'Software Architecture', cr: 3, type: 'Core', pre: 'CSF3101', status: 'Pending', sc: 'badgeOrange' },
                                    { code: 'CSF3EL1', name: 'Mobile Application Dev', cr: 3, type: 'Elective', pre: '—', status: 'Optional', sc: 'badgeYellow' },
                                    { code: 'CSF3EL2', name: 'Cloud Computing Fundamentals', cr: 3, type: 'Elective', pre: '—', status: 'Optional', sc: 'badgeYellow' },
                                ].map((r) => (
                                    <tr key={r.code}>
                                        <td><code className={styles.code}>{r.code}</code></td>
                                        <td>{r.name}</td>
                                        <td>{r.cr}</td>
                                        <td><span className={`${styles.badge} ${r.type === 'Core' ? styles.badgeRed : styles.badgeBlue}`}>{r.type}</span></td>
                                        <td><code className={styles.code}>{r.pre}</code></td>
                                        <td><span className={`${styles.badge} ${styles[r.sc as keyof typeof styles]}`}>{r.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right side */}
                <div className={styles.splitSide}>
                    {/* Bar chart */}
                    <div className={styles.chartBox}>
                        <div className={styles.chartTitle}>📊 Unit Completion by Semester</div>
                        <div className={styles.barChart}>
                            {[
                                { label: 'Y1S1', req: 100, done: 100 },
                                { label: 'Y1S2', req: 100, done: 100 },
                                { label: 'Y2S1', req: 100, done: 75 },
                                { label: 'Y2S2', req: 100, done: 58 },
                                { label: 'Y3S1', req: 100, done: 87 },
                                { label: 'Y3S2', req: 100, done: 8 },
                            ].map((b) => (
                                <div key={b.label} className={styles.barGroup}>
                                    <div className={styles.bars}>
                                        <div className={styles.barReq} style={{ height: `${b.req * 0.8}px` }} />
                                        <div className={styles.barDone} style={{ height: `${b.done * 0.8}px` }} />
                                    </div>
                                    <div className={styles.barLabel}>{b.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className={styles.chartLegend}>
                            <span><span className={styles.dotBlue} />Required</span>
                            <span><span className={styles.dotGreen} />Completed</span>
                        </div>
                    </div>

                    {/* Pie chart */}
                    <div className={styles.chartBox}>
                        <div className={styles.chartTitle}>🥧 Unit Category Breakdown</div>
                        <div className={styles.pieRow}>
                            <div className={styles.pie} />
                            <div className={styles.pieLegend}>
                                {[
                                    { color: '#569cd6', label: 'Core Units', pct: '42%' },
                                    { color: '#4ec9b0', label: 'Major Electives', pct: '29%' },
                                    { color: '#dcdcaa', label: 'Free Electives', pct: '17%' },
                                    { color: '#ce9178', label: 'MPU/Generic', pct: '12%' },
                                ].map((l) => (
                                    <div key={l.label} className={styles.pieLegendItem}>
                                        <span className={styles.pieDot} style={{ background: l.color }} />
                                        <span>{l.label} <strong>{l.pct}</strong></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* All students */}
                    <div className={styles.sectionTitle}>All Students</div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead><tr><th>ID</th><th>Name</th><th>Status</th></tr></thead>
                            <tbody>
                                <tr><td><code className={styles.code}>CS2021-0042</code></td><td>James Teck Hock WONG</td><td><span className={`${styles.badge} ${styles.badgeOrange}`}>Advisory</span></td></tr>
                                <tr><td><code className={styles.code}>CS2021-0018</code></td><td>Teck Hock WONG</td><td><span className={`${styles.badge} ${styles.badgeGreen}`}>On Track</span></td></tr>
                                <tr><td><code className={styles.code}>CS2022-0031</code></td><td>James Benedict WONG</td><td><span className={`${styles.badge} ${styles.badgeGreen}`}>On Track</span></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}