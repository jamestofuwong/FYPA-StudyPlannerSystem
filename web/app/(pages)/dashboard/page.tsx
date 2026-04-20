'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import type { ScrapedStudent } from '../../../../core/shared/types/student';


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
  const [studentIdInput, setStudentIdInput] = useState('');
  const [scrapedStudent, setScrapedStudent] = useState<{ student: ScrapedStudent; studentId: string } | null>(null);
  const [studentLoaded, setStudentLoaded] = useState(false);
  const [openYears, setOpenYears] = useState<Set<number>>(new Set([1, 2, 3]));
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [scraperApiStatus, setScraperApiStatus] = useState<string>('idle');

  // Restore persisted session on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('dashboardSession');
      if (saved) {
        const { studentId, data } = JSON.parse(saved);
        setStudentIdInput(studentId ?? '');
        setDashboardData(data ?? null);
        if (data?.student) setScrapedStudent({ student: data.student, studentId: data.studentId ?? studentId });
        setStudentLoaded(!!data);
      }
    } catch {}
  }, []);

  // Poll scraper status on mount so the dashboard reflects initializing state
  // even before the user clicks Search.
  useEffect(() => {
    const poll = async () => {
      const res = await fetch('/api/scraper/status').catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      setScraperApiStatus((prev) => (prev === 'scraping' || prev === 'pending' ? prev : data.status));
    };
    poll();
    const id = globalThis.setInterval(poll, 2000);
    return () => globalThis.clearInterval(id);
  }, []);

  const loading = internalLoading;
  const isInitializing = scraperApiStatus === 'initializing';
  const isScraping = scraperApiStatus === 'scraping';
  const isWaitingForList = scraperApiStatus === 'pending' || isInitializing;

  // Polls /api/scraper/status until the scraper bot finishes (or errors/times out).
  const pollScraperResult = async (): Promise<ScrapedStudent | null> => {
    const TIMEOUT_MS = 120_000;
    const INTERVAL_MS = 1_000;
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise<void>((r) => globalThis.setTimeout(r, INTERVAL_MS));
      const res = await fetch('/api/scraper/status').catch(() => null);
      if (!res?.ok) continue;
      const data: { status: string; result: ScrapedStudent | null; error: string | null } = await res.json();
      setScraperApiStatus(data.status);
      if (data.status === 'done' && data.result) return data.result;
      if (data.status === 'error') {
        showToast(data.error ?? 'Scrape failed.', 'error');
        return null;
      }
    }
    showToast('Scrape timed out. Check the scraper bot.', 'error');
    return null;
  };

  // Database Fetcher — called after scraping completes with the mapped student data.
  const fetchDashboardData = async (studentId: string, student: ScrapedStudent) => {
    try {
      const completedUnits = student.courseList.map((c) => c.courseId);

      // Parse year and semester from the raw portal date string (e.g. "02/2024", "Feb 2024")
      const enrollStr = student.enrollmentDate ?? '';
      const yearMatch = enrollStr.match(/\b(20\d{2})\b/);
      const intakeYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      // enrollmentDate is DD/MM/YYYY — take the second segment for month
      const monthNumMatch = enrollStr.match(/^\d{1,2}\/(\d{1,2})\//);
      const intakeMonth = monthNumMatch ? parseInt(monthNumMatch[1]) : 1;
      const intakeSemester: 1 | 2 = intakeMonth >= 7 ? 2 : 1;

      // 1. Fetch Matching Engine Data
      const matchRes = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: {
            studentID: studentId,
            courseCode: student.course,
            intakeYear,
            intakeSemester,
            completedUnitCodes: completedUnits,
            hasWIL: false,
          },
        }),
      });
      const matchData = await matchRes.json();

      if (!matchData.success) {
        showToast("API Error: Check if server is running", "error");
        return;
      }

      // 2. Fetch the top-ranked planner template from DB
      const plannerId = matchData.data.rankedPlanners[0]?.plannerID;
      if (!plannerId) {
        showToast("No matching planner found for this student.", "error");
        return;
      }
      const plannerRes = await fetch(`/api/planners/${plannerId}`);
      const plannerData = await plannerRes.json();

      if (plannerRes.ok) {
        const data = {
          match: matchData.data,
          planner: plannerData,
          completedCodes: completedUnits,
          intakeYear,
          student,
          studentId,
        };
        setDashboardData(data);
        setStudentLoaded(true);
        try { sessionStorage.setItem('dashboardSession', JSON.stringify({ studentId, data })); } catch {}
        showToast("Dashboard sync complete!", "success");
      } else {
        showToast("API Error: Check if server is running", "error");
      }
    } catch (error) {
      console.error("Dashboard Fetch Error:", error);
      showToast("Failed to fetch data.", "error");
    }
  };

  // Unit Filtering Logic
  const getUnitsByYear = (yearLevel: number) => {
    if (!dashboardData?.planner?.units) return [];

    return dashboardData.planner.units
      .filter((u: any) => u.year_level === yearLevel && u.unit !== null)
      .map((u: any) => {
        const isDone = dashboardData.completedCodes.includes(u.unit.unit_code);
        return {
          code: u.unit.unit_code,
          name: u.unit.unit_name,
          grade: isDone ? 'A' : '—',
          sem: u.semester,
          year: (dashboardData.intakeYear ?? new Date().getFullYear()) + (u.year_level - 1),
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

  const handleSearch = async () => {
    const id = studentIdInput.trim();
    if (!id) { showToast('Enter a Student ID.', 'error'); return; }
    setStudentLoaded(false);
    setScrapedStudent(null);
    setDashboardData(null);
    setScraperApiStatus('idle');
    setInternalLoading(true);
    try {
      // 1. Queue the student ID for the scraper bot via API
      const startRes = await fetch('/api/scraper/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: id }),
      });
      if (!startRes.ok) {
        showToast('Failed to queue scrape. Is the server running?', 'error');
        return;
      }
      // 2. Wait for the scraper bot to finish
      const student = await pollScraperResult();
      if (!student) return;
      // 3. Show identity card immediately — matching is still running
      setScrapedStudent({ student, studentId: id });
      // 4. Fetch matching + planner data
      await fetchDashboardData(id, student);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleClear = () => {
    setStudentLoaded(false);
    setStudentIdInput('');
    setScrapedStudent(null);
    setDashboardData(null);
    setScraperApiStatus('idle');
    try { sessionStorage.removeItem('dashboardSession'); } catch {}
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
          onKeyDown={(e) => e.key === 'Enter' && !isInitializing && handleSearch()}
          placeholder={isInitializing ? 'Waiting for scraper…' : 'Enter Student ID (e.g. BA-CS-2024-0091)'}
          disabled={isInitializing}
        />
        <button className={styles.btnPrimary} onClick={handleSearch} disabled={loading || isInitializing}>
          Search
        </button>
      </div>

      {/* ── Loading states ─────────────────────────────────────────────── */}
      {isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Loading student list...</div>
        </div>
      )}

      {isScraping && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Retrieving data...</div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !studentLoaded && !isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Enter a Student ID to begin</div>
        </div>
      )}

      {/* ── Identity Card — shown as soon as scraper returns ───────────── */}
      {scrapedStudent && (() => {
        const s = scrapedStudent.student;
        const fields: [string, string][] = [
          ['Student ID',        scrapedStudent.studentId ?? '—'],
          ['GPA',               s?.cgpa != null ? String(s.cgpa) : '—'],
          ['Grade Level',       s?.gradeLevel || '—'],
          ['Enroll Date',       s?.enrollmentDate || '—'],
          ['Exp. Grad Date',    s?.graduationDate || '—'],
          ['Credits Required',  s?.creditsRequired != null ? String(s.creditsRequired) : '—'],
          ['Credits Completed', s?.creditsCompleted != null ? String(s.creditsCompleted) : '—'],
        ];
        return (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s?.studentName || scrapedStudent.studentId || '—'}</div>
              </div>
              <button className={styles.btnDanger} onClick={handleClear}>✕ Clear</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px 16px' }}>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Dashboard Content ────────────────────────────────────────────── */}
      {!loading && studentLoaded && dashboardData && (
        <div>

          {/* Primary Major Progress */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>{dashboardData.planner.course.name}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{dashboardData.planner.major?.name ?? dashboardData.match.primaryMajor?.majorName ?? '—'}</div>
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