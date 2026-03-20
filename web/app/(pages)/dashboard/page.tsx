'use client';

import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';

export default function DashboardPage() {
  const { showToast } = useToast();
  return (
    <div className={styles.panel}>
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
              <button className={styles.btnPrimary} onClick={() => showToast('Advisory plan generated for James WONG', 'success')}>
                Generate Plan
              </button>
              <button className={styles.btnSecondary} onClick={() => showToast('Loading unit breakdown...', 'info')}>
                View Details
              </button>
            </div>
          </div>

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

          <div className={styles.sectionTitle} style={{ marginTop: 20 }}>
            Advisory Plan
          </div>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Recommended Enrollment Path</span>
              <div className={styles.btnGroup}>
                <button className={styles.btnSuccess} onClick={() => showToast('Advisory plan exported to Excel!', 'success')}>
                  📊 Export
                </button>
                <button className={styles.btnSecondary} onClick={() => showToast('Recalculating advisory plan...', 'info')}>
                  🔄 Recalculate
                </button>
              </div>
            </div>
            <div className={styles.legend}>
              <span>
                <span className={styles.suDone}>■</span> Completed
              </span>
              <span>
                <span className={styles.suPending}>■</span> Enrolled
              </span>
              <span>
                <span className={styles.suMissing}>■</span> Missing
              </span>
              <span>
                <span className={styles.suAlt}>■</span> Alternative
              </span>
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
                    <span key={code} className={`${styles.stepUnit} ${styles['su' + type.charAt(0).toUpperCase() + type.slice(1)]}`}>
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
