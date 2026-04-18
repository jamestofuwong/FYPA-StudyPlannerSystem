'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { useScraperContext } from '../../../components/providers/ScraperContext';

// ---------------------------------------------------------------------------
// Static mock data (mirrors sums-mockup.html)
// ---------------------------------------------------------------------------

// const YEAR1_UNITS = [
//   { code: 'COS10009', name: 'Introduction to Programming',                     grade: 'A',   sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'COS10026', name: 'Computing Technology Inquiry Project',              grade: 'A-',  sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'COS10025', name: 'Technology in an Indigenous Context Project',       grade: 'B+',  sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'COS10003', name: 'Computer and Logic Essentials',                     grade: 'B+',  sem: '1 · Feb 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'MPU3273',  name: 'Integrity and Anti-Corruption',                     grade: 'B',   sem: '1 · Feb 2024', year: 2024, type: 'MPU',               typeClass: 'badgeOrange', status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'MPU3212',  name: 'Bahasa Kebangsaan A',                               grade: 'B',   sem: 'Winter · Jun 2024', year: 2024, type: 'MPU',          typeClass: 'badgeOrange', status: '◆', statusColor: 'var(--accent-yellow)' },
//   { code: 'COS20007', name: 'Object-oriented Programming',                       grade: 'A-',  sem: '2 · Aug 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'TNE10006', name: 'Networks & Switching',                              grade: 'B+',  sem: '2 · Aug 2024', year: 2024, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'COS10022', name: 'Introduction to Data Science',                      grade: 'A',   sem: '2 · Aug 2024', year: 2024, type: 'Pre-scribed Elec.', typeClass: 'badgeBlue',   status: '✓', statusColor: 'var(--accent-green)' },
//   { code: 'MPU3193',  name: 'Philosophy and Current Issues',                     grade: 'B',   sem: '2 · Aug 2024', year: 2024, type: 'MPU',               typeClass: 'badgeOrange', status: '✓', statusColor: 'var(--accent-green)' },
// ];
//
// const YEAR2_UNITS = [
//   { code: 'COS30018', name: 'Intelligent Systems',                               grade: 'A',   sem: '1 · Feb 2025', year: 2025, type: 'AI Major',          typeClass: 'badgePurple', status: '✓', statusColor: 'var(--accent-green)', missing: false },
//   { code: 'COS20019', name: 'Cloud Computing Architecture',                      grade: 'B+',  sem: '1 · Feb 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)', missing: false },
//   { code: 'COS20031', name: 'Computing Technology Design Project',                grade: '—',   sem: '1 · Feb 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
//   { code: 'COS30019', name: 'Introduction to Artificial Intelligence',            grade: 'A-',  sem: '1 · Feb 2025', year: 2025, type: 'AI Major',          typeClass: 'badgePurple', status: '✓', statusColor: 'var(--accent-green)', missing: false },
//   { code: 'MPU3183',  name: 'Penghayatan Etika dan Peradaban',                    grade: 'B',   sem: '1 · Feb 2025', year: 2025, type: 'MPU',               typeClass: 'badgeOrange', status: '✓', statusColor: 'var(--accent-green)', missing: false },
//   { code: 'COS10004', name: 'Computer Systems',                                   grade: 'B+',  sem: '2 · Aug 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '✓', statusColor: 'var(--accent-green)', missing: false },
//   { code: 'COS30049', name: 'Computing Technology Innovation Project',            grade: '—',   sem: '2 · Aug 2025', year: 2025, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
//   { code: 'SWE30009', name: 'Software Testing and Reliability',                   grade: 'B',   sem: '2 · Aug 2025', year: 2025, type: 'Pre-scribed Elec.', typeClass: 'badgeBlue',   status: '✓', statusColor: 'var(--accent-green)', missing: false },
//   { code: 'COS30015', name: 'IT Security',                                        grade: 'B+',  sem: '2 · Aug 2025', year: 2025, type: 'Pre-scribed Elec.', typeClass: 'badgeBlue',   status: '✓', statusColor: 'var(--accent-green)', missing: false },
// ];
//
// const YEAR3_UNITS = [
//   { code: 'COS40005', name: 'Computing Technology Project A',                    grade: 'In Progress', sem: '1 · Feb 2026', year: 2026, type: 'Core',     typeClass: 'badgeRed',    status: '◎', statusColor: 'var(--accent-blue)',   missing: false },
//   { code: 'SWE30003', name: 'Software Architecture and Design',                   grade: '—',   sem: '1 · Feb 2026', year: 2026, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
//   { code: 'COS40007', name: 'Artificial Intelligence for Engineering',            grade: '—',   sem: '1 · Feb 2026', year: 2026, type: 'AI Major',          typeClass: 'badgePurple', status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
//   { code: 'COS40006', name: 'Computing Technology Project B',                     grade: '—',   sem: '2 · Aug 2026', year: 2026, type: 'Core',              typeClass: 'badgeRed',    status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
//   { code: 'COS30082', name: 'Applied Machine Learning',                           grade: '—',   sem: '2 · Aug 2026', year: 2026, type: 'AI Major',          typeClass: 'badgePurple', status: '⚠', statusColor: 'var(--accent-red)',   missing: true  },
// ];

// const PREREQ_ROWS = [
//   { unit: 'COS20007', requires: 'COS10009', label: 'Object-oriented Programming',                                 rel: 'requires →',  badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
//   { unit: 'COS30018', requires: 'COS20007', label: 'Intelligent Systems',                                         rel: 'requires →',  badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
//   { unit: 'COS30019', requires: 'COS20007', label: 'Introduction to Artificial Intelligence',                     rel: 'requires →',  badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
//   { unit: 'COS10004', requires: 'COS10009', label: 'Computer Systems (co-requisite)',                             rel: 'co-req →',    badge: 'Met',                    badgeClass: 'badgeGreen',  missing: false },
//   { unit: 'COS20031', requires: 'COS10009', label: 'Computing Technology Design Project — prereq met, unit not taken', rel: 'requires →', badge: 'Prereq Met — Not Enrolled', badgeClass: 'badgeOrange', missing: true },
//   { unit: 'COS40005', requires: '175cp',    label: 'Computing Technology Project A — requires 175 credit points', rel: 'requires →',  badge: 'Met (175cp achieved)',   badgeClass: 'badgeGreen',  missing: true },
//   { unit: 'COS30082', requires: 'COS30018 / COS30019', label: 'Applied Machine Learning — either Intelligent Systems or Intro to AI', rel: 'requires →', badge: 'Met', badgeClass: 'badgeGreen', missing: true },
//   { unit: 'SWE30003', requires: 'COS20007 + 150cp', label: 'Software Architecture and Design — not enrolled this semester', rel: 'requires →', badge: 'Prereq Met — Not Enrolled', badgeClass: 'badgeOrange', missing: true },
// ];
//
// const GRAD_ROWS = [
//   { code: 'COS20031',    name: 'Computing Technology Design Project',          type: 'Core',    typeCls: 'badgeRed',    prereq: 'COS10009 ✓ / COS10026 ✓', offered: 'Any',            badge: 'Not Enrolled',       badgeCls: 'badgeOrange' },
//   { code: 'COS30049',    name: 'Computing Technology Innovation Project',      type: 'Core',    typeCls: 'badgeRed',    prereq: '—',                        offered: 'Any',            badge: 'Missing',            badgeCls: 'badgeRed'    },
//   { code: 'SWE30003',    name: 'Software Architecture and Design',             type: 'Core',    typeCls: 'badgeRed',    prereq: 'COS20007 ✓ + 150cp ✓',    offered: 'Feb/Mar only',   badge: 'Not Enrolled',       badgeCls: 'badgeOrange' },
//   { code: 'COS40007',    name: 'Artificial Intelligence for Engineering',      type: 'AI Major', typeCls: 'badgePurple', prereq: 'COS10009 ✓ + 100cp ✓',   offered: 'Feb/Mar only',   badge: 'Not Enrolled',       badgeCls: 'badgeOrange' },
//   { code: 'COS40006',    name: 'Computing Technology Project B',               type: 'Core',    typeCls: 'badgeRed',    prereq: 'COS40005 (in progress)',   offered: 'Aug/Sept only',  badge: 'Pending COS40005',   badgeCls: 'badgeYellow' },
//   { code: 'COS30082',    name: 'Applied Machine Learning',                     type: 'AI Major', typeCls: 'badgePurple', prereq: 'COS30018 ✓ / COS30019 ✓', offered: 'Aug/Sept only', badge: 'Sem 2 2026',         badgeCls: 'badgeYellow' },
//   { code: 'Electives ×6', name: '6 Elective Units Required (incl. recommended electives)', type: 'Elective', typeCls: 'badgeBlue', prereq: 'Various', offered: 'Various', badge: 'Pending', badgeCls: 'badgeYellow' },
// ];

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
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const loading = isBusy || internalLoading;

  // Scraper status logic
  const DATA_SCRAPE_LABELS = new Set(['Enter student ID', 'Click enrollment dropdown', 'Select enrollment option', 'Scrape program data']);
  const isScraping = isBusy && !studentLoaded && DATA_SCRAPE_LABELS.has(botStep);
  const isWaitingForList = isBusy && !studentLoaded && !DATA_SCRAPE_LABELS.has(botStep);

  // Database Fetcher
  const fetchDashboardData = async (studentId: string) => {
      try {
        setInternalLoading(true);

        // 1. Get real data from Scraper Context
        const completedUnits = scrapeResult?.units?.map((u: any) => u.code) || ["COS10009", "COS10026", "COS10025"];

        // 2. Fetch Matching Engine Data
        const matchRes = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student: {
              studentID: studentId,
              courseCode: "BA-CS",
              intakeYear: 2024,
              completedUnitCodes: completedUnits
            }
          })
        });
        const matchData = await matchRes.json();

        // 3. Fetch Planner Template from DB (Using your validated ID)
        const plannerId = "49ef6140-9cce-46e3-95eb-51b33f847dc5";
        const plannerRes = await fetch(`/api/planners/${plannerId}`);
        const plannerData = await plannerRes.json();

        if (matchData.success && plannerRes.ok) {
          setDashboardData({
            match: matchData.data,
            planner: plannerData,
            completedCodes: completedUnits
          });
          setStudentLoaded(true);
          showToast("Dashboard sync complete!", "success");
        } else {
           showToast("API Error: Check if server is running", "error");
        }
      } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        showToast("Failed to fetch real data.", "error");
      } finally {
        setInternalLoading(false);
      }
    };

  // Unit Filtering Logic
  const getUnitsByYear = (yearLevel: number) => {
    if (!dashboardData?.planner?.units) return [];

    return dashboardData.planner.units
      .filter((u: any) => u.year_level === yearLevel)
      .map((u: any) => {
        const isDone = dashboardData.completedCodes.includes(u.unit.unit_code);
        return {
          code: u.unit.unit_code,
          name: u.unit.unit_name,
          grade: isDone ? 'A' : '—',
          sem: u.semester,
          year: 2024 + (u.year_level - 1),
          type: u.category.replace('_', ' '),
          typeClass: u.category === 'core' ? 'badgeRed' : 'badgePurple',
          status: isDone ? '✓' : '—',
          statusColor: isDone ? 'var(--accent-green)' : 'var(--text-muted)',
          missing: !isDone
        };
      });
  };

  const toggleYear = (year: number) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

  const handleSearch = () => {
    if (!studentIdInput.trim()) { showToast('Enter a Student ID.', 'error'); return; }
    setStudentLoaded(false);
    fetchDashboardData(studentIdInput.trim());
  };

  const handleClear = () => {
    setStudentLoaded(false);
    setStudentIdInput('');
    setDashboardData(null);
    showToast('Student data cleared.', 'info');
  };

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

      {/* ── Loading states ─────────────────────────────────────────────── */}
      {isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Loading student list...</div>
        </div>
      )}

      {isScraping && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, animation: 'spin 1.5s linear infinite' }}>⟳</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Retrieving data...</div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !studentLoaded && !isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Enter a Student ID to begin</div>
        </div>
      )}

      {/* ── Dashboard Content ────────────────────────────────────────────── */}
      {!loading && studentLoaded && dashboardData && (
        <div>
          {/* Identity Card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
            <div className={styles.avatar}>SN</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{studentIdInput}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {dashboardData.planner.course.name} · {dashboardData.planner.major?.name}
              </div>
            </div>
            <button className={styles.btnDanger} style={{ marginLeft: 'auto' }} onClick={handleClear}>✕ Clear</button>
          </div>

          {/* Primary Major Progress */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dashboardData.planner.course.name}</div>
            <ProgressBar pct={dashboardData.match.primaryMajor.matchPct} color="var(--accent-blue)" />
            <div style={{ fontSize: 12, marginTop: 8 }}>Match Percentage: <strong>{dashboardData.match.primaryMajor.matchPct}%</strong></div>
          </div>

          {/* Dynamic Year Tables */}
          {[1, 2, 3].map((year) => {
            const units = getUnitsByYear(year);
            const open = openYears.has(year);
            const completedCount = units.filter((u: any) => u.status === '✓').length;

            return (
              <div key={year} style={{ marginBottom: 8, border: '1px solid var(--panel-border)', borderRadius: 4, overflow: 'hidden' }}>
                <div onClick={() => toggleYear(year)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-bg)', cursor: 'pointer' }}>
                  <span style={{ transition: '0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>YEAR {year}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{completedCount} of {units.length} units completed</span>
                </div>
                {open && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Unit Code</th><th>Unit Name</th><th>Grade</th><th>Sem</th><th>Type</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {units.map((u: any) => (
                          <tr key={u.code}>
                            <td><InlineCode red={u.missing}>{u.code}</InlineCode></td>
                            <td>{u.name}</td>
                            <td>{u.grade}</td>
                            <td>Sem {u.sem}</td>
                            <td><Badge label={u.type} cls={u.typeClass as BadgeClass} /></td>
                            <td style={{ color: u.statusColor }}>{u.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Potential Minor Card */}
          <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Minors & Specializations</div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(197,134,192,0.3)', borderRadius: 4, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Big Data Analytics (Potential Minor)</div>
            <ProgressBar pct={75} color="var(--accent-yellow)" />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Estimated Progress: 75% Match</div>
          </div>

          {/* Graduation Eligibility */}
          <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Graduation Eligibility</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(244,135,113,0.08)', border: '1px solid rgba(244,135,113,0.35)', borderRadius: 4, padding: '12px 16px' }}>
            <div style={{ fontSize: 22 }}>⚠</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-red)' }}>Not Yet Eligible for Graduation</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Required units from the Course and Major are still outstanding.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}