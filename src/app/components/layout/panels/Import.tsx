'use client';

import styles from './shared.module.css';

export default function ImportPanel() {
    return (
        <div className={styles.panel}>
            <div className={styles.sectionTitle}>PDF Planner Import &amp; OCR</div>

            <div className={styles.splitLayout}>
                <div className={styles.splitMain}>

                    {/* Drop zone */}
                    <div style={{
                        border: '2px dashed var(--panel-border)', borderRadius: 6,
                        padding: '32px', textAlign: 'center', cursor: 'pointer',
                        marginBottom: 16, transition: 'border-color 0.2s',
                    }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                            Drag &amp; Drop Study Planner PDF here
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            or click to browse files · Supports PDF, scanned PDF
                        </div>
                    </div>

                    {/* Config */}
                    <div className={styles.card}>
                        <div className={styles.cardTitle}>Import Configuration</div>
                        <div className={styles.formGrid2}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Programme / Faculty</label>
                                <select className={styles.formSelect}>
                                    <option>Computer Science &amp; Engineering</option>
                                    <option>Information Technology</option>
                                    <option>Software Engineering</option>
                                    <option>Data Science</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Academic Year</label>
                                <select className={styles.formSelect}>
                                    <option>2024/2025</option>
                                    <option>2023/2024</option>
                                    <option>2022/2023</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Major</label>
                                <select className={styles.formSelect}>
                                    <option>Software Engineering</option>
                                    <option>Information Systems</option>
                                    <option>Computer Networks</option>
                                    <option>Data Science</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>OCR Language</label>
                                <select className={styles.formSelect}>
                                    <option>English (Default)</option>
                                    <option>Bahasa Malaysia</option>
                                    <option>Mixed (EN + BM)</option>
                                </select>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>OCR Confidence Threshold</label>
                            <input type="range" min={50} max={99} defaultValue={80}
                                style={{ width: '100%', accentColor: 'var(--active-highlight)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                <span>50% (permissive)</span><span>Current: 80%</span><span>99% (strict)</span>
                            </div>
                        </div>
                        <div className={styles.btnGroup}>
                            <button className={styles.btnPrimary}>🔍 Parse PDF (OCR)</button>
                            <button className={styles.btnSuccess}>✅ Update Planner</button>
                            <button className={styles.btnSecondary}>🗑️ Clear</button>
                        </div>
                    </div>

                    {/* OCR preview table */}
                    <div className={styles.sectionTitle}>OCR Preview — Parsed Units</div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>#</th><th>Unit Code</th><th>Unit Name</th><th>Credit Hr</th><th>Sem</th><th>Year</th><th>Type</th><th>Prerequisite</th><th>OCR Conf.</th></tr>
                            </thead>
                            <tbody>
                                {[
                                    { n: 1, code: 'CSF1101', name: 'Introduction to Programming', cr: 3, sem: 1, yr: 1, type: 'Core', pre: '—', conf: 98, cls: 'badgeGreen' },
                                    { n: 2, code: 'CSF1102', name: 'Computer Organization', cr: 3, sem: 1, yr: 1, type: 'Core', pre: '—', conf: 96, cls: 'badgeGreen' },
                                    { n: 3, code: 'MTH1101', name: 'Discrete Mathematics', cr: 3, sem: 1, yr: 1, type: 'Core', pre: '—', conf: 95, cls: 'badgeGreen' },
                                    { n: 4, code: 'CSF1201', name: 'Communication Skills for IT', cr: 2, sem: 1, yr: 1, type: 'MPU', pre: '—', conf: 94, cls: 'badgeGreen' },
                                    { n: 5, code: 'CSF1103', name: 'Data Structures', cr: 3, sem: 2, yr: 1, type: 'Core', pre: 'CSF1101', conf: 99, cls: 'badgeGreen' },
                                    { n: 6, code: 'CSF1104', name: 'Object-Oriented Programming', cr: 3, sem: 2, yr: 1, type: 'Core', pre: 'CSF1101', conf: 97, cls: 'badgeGreen' },
                                    { n: 7, code: 'MTH1201', name: 'Calculus & Linear Algebra', cr: 3, sem: 2, yr: 1, type: 'Core', pre: 'MTH1101', conf: 82, cls: 'badgeYellow' },
                                    { n: 8, code: 'CSF2104', name: 'Algorithm Design & Analysis', cr: 3, sem: 1, yr: 2, type: 'Core', pre: 'CSF1103', conf: 71, cls: 'badgeOrange' },
                                ].map((r) => (
                                    <tr key={r.code}>
                                        <td>{r.n}</td>
                                        <td><code className={styles.code}>{r.code}</code></td>
                                        <td>{r.name}</td>
                                        <td>{r.cr}</td>
                                        <td>{r.sem}</td>
                                        <td>{r.yr}</td>
                                        <td><span className={`${styles.badge} ${styles.badgeRed}`}>{r.type}</span></td>
                                        <td>{r.pre !== '—' ? <code className={styles.code}>{r.pre}</code> : '—'}</td>
                                        <td><span className={`${styles.badge} ${styles[r.cls as keyof typeof styles]}`}>{r.conf}%</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right side */}
                <div className={styles.splitSide}>
                    <div className={styles.sectionTitle}>Import History</div>
                    <div className={styles.card}>
                        <div className={styles.cardTitle}>Recent Imports</div>
                        {[
                            { name: 'SE_Planner_2425.pdf', date: '2025-03-01 · 42 units · 98.2% avg', status: 'Success', cls: 'badgeGreen' },
                            { name: 'IS_Planner_2425.pdf', date: '2025-02-28 · 40 units · 96.8% avg', status: 'Success', cls: 'badgeGreen' },
                            { name: 'DS_Planner_2324_scan.pdf', date: '2025-02-15 · 37/40 units · 3 manual corrections', status: 'Warning', cls: 'badgeOrange' },
                            { name: 'CN_Planner_2324.pdf', date: '2025-01-10 · OCR confidence too low (45%)', status: 'Failed', cls: 'badgeRed' },
                        ].map((h) => (
                            <div key={h.name} style={{ background: '#1a1a1a', border: '1px solid var(--panel-border)', borderRadius: 3, padding: 10, marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-white)', fontWeight: 600 }}>{h.name}</span>
                                    <span className={`${styles.badge} ${styles[h.cls as keyof typeof styles]}`}>{h.status}</span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h.date}</div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardTitle}>OCR Engine Status</div>
                        {[
                            { label: 'Engine', value: 'Tesseract 5.3.1', cls: 'accent-green' },
                            { label: 'GPU Acceleration', value: null, badge: 'Active', badgeCls: 'badgeGreen' },
                            { label: 'Avg. Parse Time', value: '3.2s / page' },
                            { label: 'Planners Loaded', value: '4 programmes' },
                            { label: 'Total Units in DB', value: '163' },
                        ].map((r) => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
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