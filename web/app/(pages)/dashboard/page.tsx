'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { useScraperContext } from '../../../components/providers/ScraperContext';

// ---------------------------------------------------------------------------
// Static mock data (mirrors sums-mockup.html)
// ---------------------------------------------------------------------------

const YEAR1_UNITS = [
  { code: 'COS10009', name: 'Introduction to Programming',                     grade: 'A',   sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'COS10026', name: 'Computing Technology Inquiry Project',              grade: 'A-',  sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'COS10025', name: 'Technology in an Indigenous Context Project',       grade: 'B+',  sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'COS10003', name: 'Computer and Logic Essentials',                     grade: 'B+',  sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'MPU3273',  name: 'Integrity and Anti-Corruption',                     grade: 'B',   sem: '1 · Feb 2024', year: 2024, type: 'MPU',               typeClass: 'badgeOrange', status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'MPU3212',  name: 'Bahasa Kebangsaan A',                               grade: 'B',   sem: 'Winter · Jun 2024', year: 2024, type: 'MPU',          typeClass: 'badgeOrange', status: '◆', statusColor: 'var(--accent-yellow)' },
  { code: 'COS20007', name: 'Object-oriented Programming',                       grade: 'A-',  sem: '2 · Aug 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'TNE10006', name: 'Networks & Switching',                              grade: 'B+',  sem: '2 · Aug 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'COS10022', name: 'Introduction to Data Science',                      grade: 'A',   sem: '2 · Aug 2024', year: 2024, type: 'Pre-scribed Elec.', typeClass: 'badgeBlue',   status: '✓', statusColor: 'var(--accent-green)' },
  { code: 'MPU3193',  name: 'Philosophy and Current Issues',                     grade: 'B',   sem: '2 · Aug 2024', year: 2024, type: 'MPU',               typeClass: 'badgeOrange', status: '✓', statusColor: 'var(--accent-green)' },
];

const YEAR2_UNITS = [
  { code: 'COS30018', name: 'Intelligent Systems',                               grade: 'A',   sem: '1 · Feb 2025', year: 2025, type: 'AI Major',          typeClass: 'badgePurple', status: '✓', statusColor: 'var(--accent-green)', missing: false },
  { code: 'COS20019', name: 'Cloud Computing Architecture',                      grade: 'B+',  sem: '1 · Feb 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)', missing: false },
  { code: 'COS20031', name: 'Computing Technology Design Project',                grade: '—',   sem: '1 · Feb 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
  { code: 'COS30019', name: 'Introduction to Artificial Intelligence',            grade: 'A-',  sem: '1 · Feb 2025', year: 2025, type: 'AI Major',          typeClass: 'badgePurple', status: '✓', statusColor: 'var(--accent-green)', missing: false },
  { code: 'MPU3183',  name: 'Penghayatan Etika dan Peradaban',                    grade: 'B',   sem: '1 · Feb 2025', year: 2025, type: 'MPU',               typeClass: 'badgeOrange', status: '✓', statusColor: 'var(--accent-green)', missing: false },
  { code: 'COS10004', name: 'Computer Systems',                                   grade: 'B+',  sem: '2 · Aug 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)', missing: false },
  { code: 'COS30049', name: 'Computing Technology Innovation Project',            grade: '—',   sem: '2 · Aug 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
  { code: 'SWE30009', name: 'Software Testing and Reliability',                   grade: 'B',   sem: '2 · Aug 2025', year: 2025, type: 'Pre-scribed Elec.', typeClass: 'badgeBlue',   status: '✓', statusColor: 'var(--accent-green)', missing: false },
  { code: 'COS30015', name: 'IT Security',                                        grade: 'B+',  sem: '2 · Aug 2025', year: 2025, type: 'Pre-scribed Elec.', typeClass: 'badgeBlue',   status: '✓', statusColor: 'var(--accent-green)', missing: false },
];

const YEAR3_UNITS = [
  { code: 'COS40005', name: 'Computing Technology Project A',                    grade: 'In Progress', sem: '1 · Feb 2026', year: 2026, type: 'Core',     typeClass: 'badgeRed',    status: '◎', statusColor: 'var(--accent-blue)',   missing: false },
  { code: 'SWE30003', name: 'Software Architecture and Design',                   grade: '—',   sem: '1 · Feb 2026', year: 2026, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
  { code: 'COS40007', name: 'Artificial Intelligence for Engineering',            grade: '—',   sem: '1 · Feb 2026', year: 2026, type: 'AI Major',          typeClass: 'badgePurple', status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
  { code: 'COS40006', name: 'Computing Technology Project B',                     grade: '—',   sem: '2 · Aug 2026', year: 2026, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
  { code: 'COS30082', name: 'Applied Machine Learning',                           grade: '—',   sem: '2 · Aug 2026', year: 2026, type: 'AI Major',          typeClass: 'badgePurple', status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
];

const PREREQ_ROWS = [
  { unit: 'COS20007', requires: 'COS10009', label: 'Object-oriented Programming',                                 rel: 'requires →',  badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
  { unit: 'COS30018', requires: 'COS20007', label: 'Intelligent Systems',                                         rel: 'requires →',  badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
  { unit: 'COS30019', requires: 'COS20007', label: 'Introduction to Artificial Intelligence',                     rel: 'requires →',  badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
  { unit: 'COS10004', requires: 'COS10009', label: 'Computer Systems (co-requisite)',                             rel: 'co-req →',    badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
  { unit: 'COS20031', requires: 'COS10009', label: 'Computing Technology Design Project — prereq met, unit not taken', rel: 'requires →', badge: 'Prereq Met — Not Enrolled', badgeClass: 'badgeOrange', missing: true },
  { unit: 'COS40005', requires: '175cp',    label: 'Computing Technology Project A — requires 175 credit points', rel: 'requires →',  badge: 'Met (175cp achieved)',   badgeClass: 'badgeGreen',  missing: true },
  { unit: 'COS30082', requires: 'COS30018 / COS30019', label: 'Applied Machine Learning — either Intelligent Systems or Intro to AI', rel: 'requires →', badge: 'Met', badgeClass: 'badgeGreen', missing: true },
  { unit: 'SWE30003', requires: 'COS20007 + 150cp', label: 'Software Architecture and Design — not enrolled this semester', rel: 'requires →', badge: 'Prereq Met — Not Enrolled', badgeClass: 'badgeOrange', missing: true },
];

const GRAD_ROWS = [
  { code: 'COS20031',    name: 'Computing Technology Design Project',          type: 'Core',    typeCls: 'badgeRed',    prereq: 'COS10009 ✓ / COS10026 ✓', offered: 'Any',            badge: 'Not Enrolled',       badgeCls: 'badgeOrange' },
  { code: 'COS30049',    name: 'Computing Technology Innovation Project',      type: 'Core',    typeCls: 'badgeRed',    prereq: '—',                        offered: 'Any',            badge: 'Missing',            badgeCls: 'badgeRed'    },
  { code: 'SWE30003',    name: 'Software Architecture and Design',             type: 'Core',    typeCls: 'badgeRed',    prereq: 'COS20007 ✓ + 150cp ✓',    offered: 'Feb/Mar only',   badge: 'Not Enrolled',       badgeCls: 'badgeOrange' },
  { code: 'COS40007',    name: 'Artificial Intelligence for Engineering',      type: 'AI Major', typeCls: 'badgePurple', prereq: 'COS10009 ✓ + 100cp ✓',   offered: 'Feb/Mar only',   badge: 'Not Enrolled',       badgeCls: 'badgeOrange' },
  { code: 'COS40006',    name: 'Computing Technology Project B',               type: 'Core',    typeCls: 'badgeRed',    prereq: 'COS40005 (in progress)',   offered: 'Aug/Sept only',  badge: 'Pending COS40005',   badgeCls: 'badgeYellow' },
  { code: 'COS30082',    name: 'Applied Machine Learning',                     type: 'AI Major', typeCls: 'badgePurple', prereq: 'COS30018 ✓ / COS30019 ✓', offered: 'Aug/Sept only', badge: 'Sem 2 2026',         badgeCls: 'badgeYellow' },
  { code: 'Electives ×6', name: '6 Elective Units Required (incl. recommended electives)', type: 'Elective', typeCls: 'badgeBlue', prereq: 'Various', offered: 'Various', badge: 'Pending', badgeCls: 'badgeYellow' },
];

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

type BadgeClass = 'badgeGreen' | 'badgeBlue' | 'badgeYellow' | 'badgeOrange' | 'badgeRed' | 'badgePurple';

function Badge({ label, cls }: { label: string; cls: BadgeClass }) {
  const purpleStyle = cls === 'badgePurple'
    ? { background: 'rgba(197,134,192,0.2)', color: 'var(--accent-purple)', border: '1px solid rgba(197,134,192,0.3)' }
    : undefined;
  return (
    <span
      className={cls !== 'badgePurple' ? `${styles.badge} ${styles[cls]}` : styles.badge}
      style={purpleStyle}
    >
      {label}
    </span>
  );
}

function InlineCode({ children, red }: { children: React.ReactNode; red?: boolean }) {
  return (
    <code className={styles.code} style={red ? { color: 'var(--accent-red)' } : undefined}>
      {children}
    </code>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressBar} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { showToast } = useToast();
  const { scrapeStudent, phase, scrapeResult, isBusy, isElectron, botStep } = useScraperContext();
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentLoaded, setStudentLoaded] = useState(false);
  const [openYears, setOpenYears] = useState<Set<number>>(new Set([1, 2, 3]));

  const loading = isBusy;

  // Only show "Retrieving data" during the actual data-scraping steps; everything
  // else (including the initial "Starting…" state) shows "Loading student list".
  const DATA_SCRAPE_LABELS = new Set(['Enter student ID', 'Click enrollment dropdown', 'Select enrollment option', 'Scrape program data']);
  const isScraping = isBusy && !studentLoaded && DATA_SCRAPE_LABELS.has(botStep);
  const isWaitingForList = isBusy && !studentLoaded && !DATA_SCRAPE_LABELS.has(botStep);

  // Mark as loaded when a successful scrape result arrives
  useEffect(() => {
    if (scrapeResult?.scraped) setStudentLoaded(true);
  }, [scrapeResult]);

  const toggleYear = (year: number) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

  const handleSearch = () => {
    if (!studentIdInput.trim()) { showToast('Enter a Student ID.', 'error'); return; }
    if (!isElectron) { showToast('Scraping requires the desktop (Electron) app.', 'error'); return; }
    setStudentLoaded(false);
    scrapeStudent(studentIdInput.trim());
  };

  const handleClear = () => {
    setStudentLoaded(false);
    setStudentIdInput('');
    showToast('Student data cleared from memory.', 'info');
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={styles.panel}>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔍</span>
        <input
          className={`${styles.formInput} ${styles.formInputMono}`}
          style={{ flex: 1 }}
          value={studentIdInput}
          onChange={(e) => setStudentIdInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Enter Student ID (e.g. BA-CS-2024-0091)"
        />
        <button className={styles.btnPrimary} onClick={handleSearch} disabled={loading}>
          Search
        </button>
      </div>

      {/* ── Loading state: waiting for student list ─────────────────────── */}
      {isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: 8 }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Loading student list in portal…</div>
        </div>
      )}

      {/* ── Loading state: scraping student data ─────────────────────────── */}
      {isScraping && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12, display: 'inline-block', animation: 'spin 1.5s linear infinite' }}>⟳</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Retrieving student data from portal…</div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !studentLoaded && !isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: 8 }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Enter a Student ID above to begin</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Student data is retrieved directly from the university portal and is never stored by this application.</div>
        </div>
      )}

      {/* ── Student data ─────────────────────────────────────────────────── */}
      {!loading && studentLoaded && (
        <div>

          {/* Student identity card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
            <div className={styles.avatar} style={{ width: 36, height: 36, fontSize: 13 }}>SN</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Student Name</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                BA-CS-2024-0091 · Bachelor of Computer Science (Artificial Intelligence) · Enrolled Feb 2024 · Year 2
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', border: '1px solid var(--panel-border)', borderRadius: 2, padding: '2px 6px', fontFamily: 'var(--font-mono)' }}>
                SESSION DATA ONLY — NOT STORED
              </span>
              <button className={styles.btnSuccess} onClick={() => showToast('Export to Excel coming soon.', 'info')}>📊 Export to Excel</button>
              <button className={styles.btnDanger} style={{ fontSize: 11 }} onClick={handleClear}>✕ Clear</button>
            </div>
          </div>

          {/* ── Major Detection ─────────────────────────────────────────── */}
          <div className={styles.sectionTitle}>Major Detection Results</div>

          {/* Primary major card */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>Detected Primary Major</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Artificial Intelligence</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>83%</span>
              <div style={{ flex: 1 }}>
                <ProgressBar pct={83} color="var(--accent-blue)" />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Match against BA-CS (Artificial Intelligence) Planner · Intake Feb/Mar 2024</div>
              </div>
              <Badge label="HIGH MATCH" cls="badgeGreen" />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              <span>Core Units: <strong style={{ color: 'var(--text-primary)' }}>6 / 8</strong></span>
              <span>AI Major Units: <strong style={{ color: 'var(--text-primary)' }}>4 / 8</strong></span>
              <span>Electives: <strong style={{ color: 'var(--text-primary)' }}>2 / 8</strong></span>
              <span>Credit Points: <strong style={{ color: 'var(--text-primary)' }}>175 / 300</strong></span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
              {['COS10009','COS10026','COS10025','COS10003','MPU3273','COS20007','TNE10006','COS10022','MPU3193','COS30018','COS30019','COS20019'].map(u => (
                <span key={u} className={`${styles.stepUnit} ${styles.suDone}`}>{u}</span>
              ))}
              {['COS20031 ⚠','COS30049 ⚠','SWE30009 ⚠'].map(u => (
                <span key={u} className={`${styles.stepUnit} ${styles.suMissing}`}>{u}</span>
              ))}
            </div>
            <div className={styles.btnGroup}>
              <button className={styles.btnSecondary} onClick={() => showToast('Override modal coming soon.', 'info')}>↔ Override Major</button>
              <button className={styles.btnSecondary} onClick={() => showToast('Loading full breakdown…', 'info')}>View Full Breakdown</button>
            </div>
          </div>

          {/* Second major card */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(197,134,192,0.3)', borderRadius: 4, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>Potential Second Major / Minor</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Big Data Analytics (Minor)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-yellow)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>75%</span>
              <div style={{ flex: 1 }}>
                <ProgressBar pct={75} color="var(--accent-yellow)" />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Meets 70% second major threshold · 3 of 4 minor units completed</div>
              </div>
              <Badge label="2ND MAJOR" cls="badgePurple" />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              <span>Minor Units Completed: <strong style={{ color: 'var(--text-primary)' }}>3 / 4</strong></span>
              <span>Remaining: <strong style={{ color: 'var(--text-primary)' }}>COS20028</strong></span>
            </div>
            <div className={styles.btnGroup}>
              <button className={styles.btnSecondary} onClick={() => showToast('Override modal coming soon.', 'info')}>↔ Override</button>
            </div>
          </div>

          {/* Other comparisons */}
          <div className={styles.sectionTitle} style={{ marginTop: 4 }}>Other Planner Comparisons</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {[
              { rank: '3rd', rankCls: 'badgeYellow' as BadgeClass, name: 'Bachelor of Computer Science (General)',       pct: 62, barColor: 'var(--accent-orange)', pctColor: 'var(--accent-orange)', badge: 'PARTIAL', badgeCls: 'badgeOrange' as BadgeClass },
              { rank: '4th', rankCls: 'badgeOrange' as BadgeClass, name: 'Bachelor of Computer Science (Cybersecurity)', pct: 41, barColor: 'var(--accent-red)',    pctColor: 'var(--accent-red)',    badge: 'LOW',     badgeCls: 'badgeRed'    as BadgeClass },
            ].map((row) => (
              <div key={row.rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 3 }}>
                <Badge label={row.rank} cls={row.rankCls} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{row.name}</span>
                <div style={{ width: 120 }}><ProgressBar pct={row.pct} color={row.barColor} /></div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: row.pctColor, width: 36, textAlign: 'right' }}>{row.pct}%</span>
                <Badge label={row.badge} cls={row.badgeCls} />
              </div>
            ))}
          </div>

          {/* ── Unit Progress by Semester ────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className={styles.sectionTitle} style={{ marginBottom: 0, flex: 1 }}>Unit Progress by Semester</div>
            <div className={styles.btnGroup} style={{ marginLeft: 12 }}>
              <button className={styles.btnSecondary} style={{ fontSize: 11 }} onClick={() => showToast('Showing all units.', 'info')}>Show All</button>
              <button className={styles.btnSecondary} style={{ fontSize: 11 }} onClick={() => showToast('Showing matched units only.', 'info')}>Matched Only</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            <span><span style={{ color: 'var(--accent-green)' }}>✓</span> Planner match</span>
            <span><span style={{ color: 'var(--accent-yellow)' }}>◆</span> Elective</span>
            <span><span style={{ color: 'var(--accent-red)' }}>⚠</span> Unmet prereq</span>
          </div>

          {/* Year sections */}
          {[
            { year: 1, units: YEAR1_UNITS, summary: '9 units completed',          badge: 'All Complete', badgeCls: 'badgeGreen'  as BadgeClass },
            { year: 2, units: YEAR2_UNITS, summary: '7 of 9 units completed',     badge: '2 Missing',    badgeCls: 'badgeOrange' as BadgeClass },
            { year: 3, units: YEAR3_UNITS, summary: 'In progress — 1 enrolled',   badge: 'Current',      badgeCls: 'badgeBlue'   as BadgeClass },
          ].map(({ year, units, summary, badge, badgeCls }) => {
            const open = openYears.has(year);
            return (
              <div key={year} style={{ marginBottom: 8, border: '1px solid var(--panel-border)', borderRadius: 4, overflow: 'hidden' }}>
                {/* Year header */}
                <div
                  onClick={() => toggleYear(year)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-bg)', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>YEAR {year}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{summary}</span>
                  <span style={{ marginLeft: 'auto' }}><Badge label={badge} cls={badgeCls} /></span>
                </div>
                {/* Year body */}
                {open && (
                  <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Unit Code</th><th>Unit Name</th><th>Grade</th>
                          <th>Semester</th><th>Year</th><th>Type</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {units.map((u) => {
                          const isMissing = 'missing' in u && !!(u as { missing?: boolean }).missing;
                          return (
                          <tr key={u.code} style={isMissing ? { background: 'rgba(244,135,113,0.05)' } : undefined}>
                            <td><InlineCode red={isMissing}>{u.code}</InlineCode></td>
                            <td style={isMissing ? { color: 'var(--accent-red)' } : undefined}>{u.name}</td>
                            <td style={{ color: u.grade === '—' || u.grade === 'In Progress' ? 'var(--text-muted)' : u.grade.startsWith('A') ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>{u.grade}</td>
                            <td>{u.sem}</td>
                            <td>{u.year}</td>
                            <td><Badge label={u.type} cls={u.typeClass as BadgeClass} /></td>
                            <td style={{ color: u.statusColor, fontSize: 12 }}>{u.status}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Prerequisite Status ──────────────────────────────────────── */}
          <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Prerequisite Status</div>
          <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
            {PREREQ_ROWS.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderBottom: i < PREREQ_ROWS.length - 1 ? '1px solid var(--sidebar-border)' : 'none',
                  background: row.missing ? 'rgba(244,135,113,0.04)' : 'transparent',
                }}
              >
                <InlineCode red={row.missing}>{row.unit}</InlineCode>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{row.rel}</span>
                <InlineCode>{row.requires}</InlineCode>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, marginLeft: 8 }}>{row.label}</span>
                <Badge label={row.badge} cls={row.badgeClass as BadgeClass} />
              </div>
            ))}
          </div>

          {/* ── Graduation Eligibility ───────────────────────────────────── */}
          <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Graduation Eligibility</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(244,135,113,0.08)', border: '1px solid rgba(244,135,113,0.35)', borderRadius: 4, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>⚠</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 3 }}>Not Yet Eligible for Graduation</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>175 / 300 credit points completed · 4 AI Major units outstanding · 6 Elective units outstanding · 2 missing core units</div>
            </div>
          </div>
          <div className={styles.tableWrap} style={{ marginBottom: 0 }}>
            <table className={styles.table}>
              <thead>
                <tr><th>Unit Code</th><th>Unit Name</th><th>Type</th><th>Prerequisite</th><th>Offered</th><th>Status</th></tr>
              </thead>
              <tbody>
                {GRAD_ROWS.map((r) => (
                  <tr key={r.code}>
                    <td><InlineCode>{r.code}</InlineCode></td>
                    <td>{r.name}</td>
                    <td><Badge label={r.type} cls={r.typeCls as BadgeClass} /></td>
                    <td><code className={styles.code} style={{ fontSize: 10 }}>{r.prereq}</code></td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.offered}</td>
                    <td><Badge label={r.badge} cls={r.badgeCls as BadgeClass} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  );
}
