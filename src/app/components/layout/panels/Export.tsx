'use client';

import styles from './shared.module.css';
import { useToast } from '../ToastProvider';

export default function ExportPanel() {
    const { showToast } = useToast();
    return (
        <div className={styles.panel}>
            <div className={styles.sectionTitle}>Excel Export Center</div>

            <div className={styles.splitLayout}>
                <div className={styles.splitMain}>

                    {/* Export cards grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                        {[
                            { icon: '📊', title: 'Dashboard Report', desc: 'Exports current student major detection results, match percentages, and completion stats.', btnCls: 'btnPrimary', msg: 'Dashboard Report exported successfully!' },
                            { icon: '📋', title: 'Advisory Plan', desc: 'Full advisory plan per student with recommended unit paths, missing units and alternatives.', btnCls: 'btnPrimary', msg: 'Advisory Plans exported successfully!' },
                            { icon: '👥', title: 'Student Data', desc: 'All student enrollment data scraped from portal including GPA, units, and cohort details.', btnCls: 'btnPrimary', msg: 'Student Data exported successfully!' },
                        ].map((c) => (
                            <div key={c.title} style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                                <div style={{ fontSize: 28 }}>{c.icon}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-white)', fontWeight: 600 }}>{c.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>{c.desc}</div>
                                <button className={styles[c.btnCls as keyof typeof styles]} style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast(c.msg, 'success')}>📥 Export</button>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                        {[
                            { icon: '🎓', title: 'Major Analysis', desc: 'Breakdown of all students by detected major, second major possibilities, and confidence scores.', btnCls: 'btnPrimary', msg: 'Major Analysis exported successfully!' },
                            { icon: '📄', title: 'Unit Planner DB', desc: 'Export the current study planner database — all programmes, units, prerequisites.', btnCls: 'btnPrimary', msg: 'Unit Planner DB exported successfully!' },
                            { icon: '📈', title: 'Analytics Report', desc: 'Cohort-level analytics: average GPA, at-risk students, major distribution trends.', btnCls: 'btnPrimary', msg: 'Analytics Report exported successfully!' },
                        ].map((c) => (
                            <div key={c.title} style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                                <div style={{ fontSize: 28 }}>{c.icon}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-white)', fontWeight: 600 }}>{c.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>{c.desc}</div>
                                <button className={styles[c.btnCls as keyof typeof styles]} style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast(c.msg, 'success')}>📥 Export</button>
                            </div>
                        ))}
                    </div>

                    {/* Export options */}
                    <div className={styles.card}>
                        <div className={styles.cardTitle}>Export Options</div>
                        <div className={styles.formGrid2}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Export Format</label>
                                <select className={styles.formSelect}><option>.xlsx (Excel 2016+)</option><option>.xls (Legacy)</option><option>.csv (Flat)</option></select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Filename Template</label>
                                <input className={`${styles.formInput} ${styles.formInputMono}`} defaultValue="SUMS_{report}_{date}" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Output Directory</label>
                                <input className={`${styles.formInput} ${styles.formInputMono}`} defaultValue="C:\Users\JoeLee\Desktop\SUMS_Exports\" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Include Charts in Excel</label>
                                <select className={styles.formSelect}><option>Yes — Embedded Charts</option><option>No — Data Only</option></select>
                            </div>
                        </div>
                        <div className={styles.btnGroup}>
                            <button className={styles.btnPrimary} onClick={() => showToast('Exporting all reports...', 'info')}>📦 Export All Reports</button>
                            <button className={styles.btnSecondary} onClick={() => showToast('Output folder opened.', 'info')}>📁 Open Output Folder</button>
                        </div>
                    </div>
                </div>

                {/* Right: export history */}
                <div className={styles.splitSide}>
                    <div className={styles.sectionTitle}>Export History</div>
                    <div className={styles.tableWrap} style={{ maxHeight: 500 }}>
                        <table className={styles.table}>
                            <thead><tr><th>File</th><th>Date</th><th>Status</th></tr></thead>
                            <tbody>
                                {[
                                    { file: 'SUMS_Dashboard_20250301.xlsx', date: '01 Mar 09:15', s: 'Done', sc: 'badgeGreen' },
                                    { file: 'SUMS_Advisory_20250301.xlsx', date: '01 Mar 09:18', s: 'Done', sc: 'badgeGreen' },
                                    { file: 'SUMS_Students_20250228.xlsx', date: '28 Feb 16:30', s: 'Done', sc: 'badgeGreen' },
                                    { file: 'SUMS_Analytics_20250228.xlsx', date: '28 Feb 16:31', s: 'Done', sc: 'badgeGreen' },
                                    { file: 'SUMS_Planner_20250215.xlsx', date: '15 Feb 11:00', s: 'Done', sc: 'badgeGreen' },
                                    { file: 'SUMS_AllReports_20250210.xlsx', date: '10 Feb 08:45', s: 'Partial', sc: 'badgeOrange' },
                                    { file: 'SUMS_Advisory_20250205.xlsx', date: '05 Feb 14:22', s: 'Done', sc: 'badgeGreen' },
                                ].map((r) => (
                                    <tr key={r.file}>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.file}</td>
                                        <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date}</td>
                                        <td><span className={`${styles.badge} ${styles[r.sc as keyof typeof styles]}`}>{r.s}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}