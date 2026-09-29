'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';
import type { ScrapedStudent } from '../../../../core/shared/types/student';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';

type StatusResponse = {
  sessionStatus: SessionStatus;
  sessionError: string | null;
  studentCount: number;
  manualMode: boolean;
  manualStep: 0 | 1 | 2 | 3 | 4;
  manualStepError: string | null;
};

const MANUAL_STEP_LABELS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'Idle',
  1: 'Browser open — complete SSO in the window',
  2: 'Navigated to Degree1 — iframe located',
  3: 'PortalExtension loaded — token captured',
  4: 'Session collected',
};

type SearchResult = {
  student_id: string;
  name: string;
  db_id: number;
};

type Enrollment = {
  EnrollId: number;
  EnrollmentDesc: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColour(s: SessionStatus) {
  if (s === 'logged-in')     return 'var(--accent-green)';
  if (s === 'login-pending') return 'var(--accent-yellow)';
  if (s === 'login-error')   return 'var(--accent-red)';
  return 'var(--text-muted)';
}

function statusLabel(s: SessionStatus) {
  if (s === 'logged-in')     return 'Connected';
  if (s === 'login-pending') return 'Waiting for login…';
  if (s === 'login-error')   return 'Login failed';
  return 'Not connected';
}

function groupByTerm(courseList: ScrapedStudent['courseList']) {
  const map = new Map<string, typeof courseList>();
  for (const c of courseList) {
    const key = c.term || 'Unknown';
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  return map;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScrapingPage() {
  // Session
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [sessionError, setSessionError]   = useState<string | null>(null);
  const [studentCount, setStudentCount]   = useState(0);
  const [keepOpen, setKeepOpen]           = useState(false);
  const [manualMode, setManualMode]       = useState(false);
  const [manualStep, setManualStep]       = useState<0 | 1 | 2 | 3 | 4>(0);
  const [manualStepError, setManualStepError] = useState<string | null>(null);
  const [advancingStep, setAdvancingStep] = useState<number | null>(null);

  // Student list
  const [allStudents, setAllStudents]   = useState<SearchResult[]>([]);
  const [studentFilter, setStudentFilter] = useState('');

  // Search
  const [query, setQuery]               = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<SearchResult | null>(null);

  // Enrollments
  const [enrollments, setEnrollments]   = useState<Enrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  // Degree audit
  const [student, setStudent]           = useState<ScrapedStudent | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError]     = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const studentsLoadedRef = useRef(false);

  // ── Poll status ─────────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper/status');
      const data: StatusResponse = await res.json();
      setSessionStatus(data.sessionStatus);
      setSessionError(data.sessionError);
      const count = data.studentCount ?? 0;
      setStudentCount(count);
      setManualStep(data.manualStep ?? 0);
      setManualStepError(data.manualStepError ?? null);

      // Fetch the full student list once it's available
      if (count > 0 && !studentsLoadedRef.current) {
        studentsLoadedRef.current = true;
        fetch('/api/scraper/portal-students')
          .then(r => r.json())
          .then(d => setAllStudents(d.students ?? []))
          .catch(() => { studentsLoadedRef.current = false; });
      }
    } catch { /* network error — ignore */ }
  }, []);

  useEffect(() => {
    void fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // ── Login / logout ──────────────────────────────────────────────────────────

  async function handleLogin() {
    await fetch('/api/scraper/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepOpen, manual: manualMode }),
    });
    setSessionStatus('login-pending');
  }

  async function handleAdvanceStep(step: 2 | 3 | 4) {
    setAdvancingStep(step);
    setManualStepError(null);
    try {
      const res = await fetch('/api/scraper/login-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, keepOpen }),
      });
      const data = await res.json();
      if (!data.ok) setManualStepError(data.error ?? `Step ${step} failed`);
    } catch (err) {
      setManualStepError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setAdvancingStep(null);
    }
  }

  async function handleLogout() {
    await fetch('/api/scraper/logout', { method: 'POST' });
    setSessionStatus('idle');
    setSessionError(null);
    setStudentCount(0);
    setAllStudents([]);
    setStudentFilter('');
    studentsLoadedRef.current = false;
    setQuery('');
    setSearchResults([]);
    setSelectedStudent(null);
    setEnrollments([]);
    setStudent(null);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/scraper/portal-students/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function handleSelectStudent(result: SearchResult) {
    setSelectedStudent(result);
    setSearchResults([]);
    setQuery('');
    setEnrollments([]);
    setStudent(null);
    setAuditError(null);

    setLoadingEnrollments(true);
    try {
      const res = await fetch('/api/scraper/portal-enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbId: result.db_id }),
      });
      const data = await res.json();
      setEnrollments(data.enrollments ?? []);
    } finally {
      setLoadingEnrollments(false);
    }
  }

  // ── Degree audit ────────────────────────────────────────────────────────────

  async function handleSelectEnrollment(enroll: Enrollment) {
    if (!selectedStudent) return;
    setLoadingAudit(true);
    setAuditError(null);
    setStudent(null);
    try {
      const res = await fetch('/api/scraper/portal-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbId: selectedStudent.db_id,
          enrollID: enroll.EnrollId,
          studentNumber: selectedStudent.student_id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStudent(data.student);
      } else {
        setAuditError(data.error ?? 'Failed to load degree audit');
      }
    } finally {
      setLoadingAudit(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const termGroups = student ? groupByTerm(student.courseList) : null;

  return (
    <div className={styles.panel}>
      <div className={styles.sectionTitle}>Student Portal — API Pipeline</div>

      <div className={styles.splitLayout}>
        <div className={styles.splitMain}>

          {/* ── Session card ── */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Portal Session</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8,
                  borderRadius: '50%', background: statusColour(sessionStatus),
                  boxShadow: sessionStatus === 'login-pending'
                    ? `0 0 6px ${statusColour(sessionStatus)}` : 'none',
                }} />
                <span style={{ fontSize: 12, color: statusColour(sessionStatus) }}>
                  {statusLabel(sessionStatus)}
                </span>
              </div>
            </div>

            {sessionStatus === 'login-pending' && (
              <div style={{ fontSize: 12, color: 'var(--accent-yellow)', marginBottom: 10 }}>
                A browser window has opened — complete the Microsoft SSO login there.
                This page will update automatically when done.
              </div>
            )}

            {sessionStatus === 'login-error' && sessionError && (
              <div style={{ fontSize: 12, color: 'var(--accent-red)', marginBottom: 10,
                padding: '6px 10px', background: 'rgba(244,135,113,0.08)',
                border: '1px solid rgba(244,135,113,0.3)', borderRadius: 3 }}>
                {sessionError}
              </div>
            )}

            {sessionStatus === 'logged-in' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                {studentCount > 0
                  ? `${studentCount.toLocaleString()} students loaded in memory`
                  : 'Loading student list…'}
              </div>
            )}

            {sessionStatus !== 'logged-in' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={keepOpen}
                    onChange={e => setKeepOpen(e.target.checked)}
                    style={{ accentColor: 'var(--accent-orange)', cursor: 'pointer' }}
                  />
                  Keep browser open after login (debug)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={manualMode}
                    onChange={e => setManualMode(e.target.checked)}
                    style={{ accentColor: 'var(--accent-orange)', cursor: 'pointer' }}
                  />
                  Manual step-through mode (debug)
                </label>
              </div>
            )}

            {/* ── Manual step buttons ── */}
            {manualMode && sessionStatus === 'login-pending' && (
              <div style={{ marginBottom: 10 }}>
                {/* Step progress */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8,
                  fontFamily: 'var(--font-mono)', padding: '6px 10px',
                  background: 'var(--surface-bg)', borderRadius: 3 }}>
                  Step {manualStep}/5 — {MANUAL_STEP_LABELS[manualStep]}
                </div>

                {manualStepError && (
                  <div style={{ fontSize: 11, color: 'var(--accent-red)', marginBottom: 8,
                    padding: '6px 10px', background: 'rgba(244,135,113,0.08)',
                    border: '1px solid rgba(244,135,113,0.3)', borderRadius: 3 }}>
                    {manualStepError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {([
                    { step: 2, label: 'Step 2 — Navigate to Degree1, find iframe' },
                    { step: 3, label: 'Step 3 — Load PortalExtension, capture token' },
                    { step: 4, label: 'Step 4 — Collect cookies & finalise session' },
                  ] as const).map(({ step, label }) => {
                    const isNext    = step === manualStep + 1;
                    const isDone    = step <= manualStep;
                    const isLoading = advancingStep === step;
                    return (
                      <button
                        key={step}
                        className={isDone ? styles.btnSecondary : styles.btnSuccess}
                        style={{
                          textAlign: 'left', padding: '7px 12px', fontSize: 12,
                          opacity: isDone ? 0.5 : isNext ? 1 : 0.35,
                        }}
                        disabled={!isNext || isLoading}
                        onClick={() => handleAdvanceStep(step)}
                      >
                        {isLoading ? `Running step ${step}…` : isDone ? `✓ ${label}` : label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={styles.btnGroup}>
              {sessionStatus !== 'logged-in' && (
                <button
                  className={styles.btnSuccess}
                  onClick={handleLogin}
                  disabled={sessionStatus === 'login-pending'}
                >
                  {sessionStatus === 'login-pending' ? 'Waiting for SSO…' : 'Login to Portal'}
                </button>
              )}
              {sessionStatus === 'logged-in' && (
                <button className={styles.btnDanger} onClick={handleLogout}>
                  Logout
                </button>
              )}
            </div>
          </div>

          {/* ── Student list table ── */}
          {allStudents.length > 0 && (
            <div className={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className={styles.cardTitle}>
                  Student List
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
                    {allStudents.length.toLocaleString()} students
                  </span>
                </div>
                <input
                  className={styles.formInput}
                  style={{ width: 220, marginBottom: 0 }}
                  value={studentFilter}
                  onChange={e => setStudentFilter(e.target.value)}
                  placeholder="Filter by name or ID…"
                />
              </div>
              <div className={styles.tableWrap} style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th style={{ width: 80 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStudents
                      .filter(s => {
                        if (!studentFilter.trim()) return true;
                        const q = studentFilter.toLowerCase();
                        return (s.name ?? '').toLowerCase().includes(q) || (s.student_id ?? '').toLowerCase().includes(q);
                      })
                      .slice(0, 200)
                      .map(s => (
                        <tr key={s.db_id}>
                          <td><code className={styles.code}>{s.student_id}</code></td>
                          <td>{s.name}</td>
                          <td>
                            <button
                              className={styles.btnSecondary}
                              style={{ padding: '3px 10px', fontSize: 11 }}
                              onClick={() => handleSelectStudent(s)}
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const filtered = studentFilter.trim()
                  ? allStudents.filter(s => {
                      const q = studentFilter.toLowerCase();
                      return (s.name ?? '').toLowerCase().includes(q) || (s.student_id ?? '').toLowerCase().includes(q);
                    })
                  : allStudents;
                return filtered.length > 200 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                    Showing 200 of {filtered.length.toLocaleString()} — use the filter to narrow results
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* ── Selected student + enrollment picker ── */}
          {selectedStudent && (
            <div className={styles.studentBar}>
              <div className={styles.avatar}>
                {selectedStudent.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className={styles.studentName}>{selectedStudent.name}</div>
                <div className={styles.studentMeta}>{selectedStudent.student_id}</div>
              </div>
              <button
                className={styles.studentSelect}
                onClick={() => { setSelectedStudent(null); setEnrollments([]); setStudent(null); }}
              >
                Clear
              </button>
            </div>
          )}

          {loadingEnrollments && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Loading enrollments…
            </div>
          )}

          {enrollments.length > 0 && !student && !loadingAudit && (
            <div className={styles.card}>
              <div className={styles.cardTitle} style={{ marginBottom: 10 }}>Select Enrollment</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enrollments.map(e => (
                  <button
                    key={e.EnrollId}
                    className={styles.btnSecondary}
                    style={{ textAlign: 'left', padding: '8px 12px' }}
                    onClick={() => handleSelectEnrollment(e)}
                  >
                    {e.EnrollmentDesc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingAudit && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Loading degree audit…
            </div>
          )}

          {auditError && (
            <div style={{ fontSize: 12, color: 'var(--accent-red)', marginBottom: 12,
              padding: '8px 12px', background: 'rgba(244,135,113,0.08)',
              border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4 }}>
              {auditError}
            </div>
          )}

          {/* ── Degree audit result ── */}
          {student && (
            <>
              <div className={styles.sectionTitle}>Degree Audit — {student.course}</div>

              {/* Credit summary */}
              <div className={styles.statGrid}>
                <div className={`${styles.statCard} ${styles.blue}`}>
                  <div className={styles.statLabel}>Credits Required</div>
                  <div className={styles.statValue}>{student.creditsRequired}</div>
                  <div className={styles.statSub}>to graduate</div>
                </div>
                <div className={`${styles.statCard} ${styles.green}`}>
                  <div className={styles.statLabel}>Credits Earned</div>
                  <div className={styles.statValue}>{student.creditsCompleted}</div>
                  <div className={styles.statSub}>completed</div>
                </div>
                <div className={`${styles.statCard} ${styles.yellow}`}>
                  <div className={styles.statLabel}>Scheduled</div>
                  <div className={styles.statValue}>{student.scheduledCredits}</div>
                  <div className={styles.statSub}>in progress</div>
                </div>
                <div className={`${styles.statCard} ${styles.orange}`}>
                  <div className={styles.statLabel}>Cum GPA</div>
                  <div className={styles.statValue} style={{ fontSize: 22 }}>
                    {student.cgpa.toFixed(2)}
                  </div>
                  <div className={styles.statSub}>{student.gradeLevel}</div>
                </div>
              </div>

              {/* Info row */}
              <div className={styles.card}>
                <div className={styles.formGrid2}>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label className={styles.formLabel}>Status</label>
                    <div className={styles.fieldValue}>{student.status}</div>
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label className={styles.formLabel}>Grade Level</label>
                    <div className={styles.fieldValue}>{student.gradeLevel}</div>
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label className={styles.formLabel}>Enrolled</label>
                    <div className={styles.fieldValueMono}>{student.enrollmentDate?.split('T')[0] ?? '—'}</div>
                  </div>
                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label className={styles.formLabel}>Expected Graduation</label>
                    <div className={styles.fieldValueMono}>{student.graduationDate?.split('T')[0] ?? '—'}</div>
                  </div>
                  {student.areasOfStudy && student.areasOfStudy.length > 0 && (
                    <div className={styles.formGroup} style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                      <label className={styles.formLabel}>Areas of Study</label>
                      <div className={styles.fieldValue}>{student.areasOfStudy.join(', ')}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Course history */}
              <div className={styles.sectionTitle}>
                Course History ({student.courseList.length} units)
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Credits</th>
                      <th>Earned</th>
                      <th>Status</th>
                      <th>Grade</th>
                      <th>Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termGroups && [...termGroups.entries()].map(([term, courses]) => (
                      <React.Fragment key={`term-${term}`}>
                        <tr>
                          <td colSpan={7} style={{
                            padding: '6px 12px', background: 'var(--surface-bg)',
                            fontFamily: 'var(--font-mono)', fontSize: 10,
                            color: 'var(--accent-blue)', fontWeight: 600,
                            letterSpacing: '1px', textTransform: 'uppercase',
                          }}>
                            {term}
                          </td>
                        </tr>
                        {courses.map((c, i) => (
                          <tr key={`${term}-${c.courseId ?? i}`}>
                            <td><code className={styles.code}>{c.courseId}</code></td>
                            <td>{c.courseTitle}</td>
                            <td className={styles.tdRight}>{c.credits}</td>
                            <td className={styles.tdRight}>{c.creditsEarned}</td>
                            <td>
                              <span className={`${styles.badge} ${
                                c.status === 'Complete'  ? styles.badgeGreen  :
                                c.status === 'Current' || c.status === 'Scheduled'
                                                         ? styles.badgeBlue   :
                                c.status === 'Future'    ? styles.badgeYellow :
                                                           styles.badgeOrange
                              }`}>
                                {c.status}
                              </span>
                            </td>
                            <td><code className={styles.code}>{c.grade || '—'}</code></td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                              color: 'var(--text-muted)' }}>{c.term}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className={styles.splitSide}>
          <div className={styles.sectionTitle}>Session Info</div>
          <div className={styles.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={`${styles.statCard} ${styles.blue}`} style={{ margin: 0 }}>
                <div className={styles.statLabel}>Students in Memory</div>
                <div className={styles.statValue}>{studentCount > 0 ? studentCount.toLocaleString() : '—'}</div>
                <div className={styles.statSub}>active students</div>
              </div>
              <div className={`${styles.statCard} ${styles.green}`} style={{ margin: 0 }}>
                <div className={styles.statLabel}>Cum GPA</div>
                <div className={styles.statValue} style={{ fontSize: 20 }}>
                  {student ? student.cgpa.toFixed(2) : '—'}
                </div>
                <div className={styles.statSub}>current student</div>
              </div>
              <div className={`${styles.statCard} ${styles.yellow}`} style={{ margin: 0 }}>
                <div className={styles.statLabel}>Status</div>
                <div className={styles.statValue} style={{ fontSize: 14, paddingTop: 4 }}>
                  {student?.status ?? statusLabel(sessionStatus)}
                </div>
                <div className={styles.statSub}>
                  {student ? `${student.courseList.length} units` : 'awaiting selection'}
                </div>
              </div>
            </div>
          </div>

          {student && (
            <>
              <div className={styles.sectionTitle} style={{ marginTop: 4 }}>Credit Progress</div>
              <div className={styles.card}>
                {([
                  { label: 'Required',  val: student.creditsRequired,  colour: 'var(--accent-blue)' },
                  { label: 'Earned',    val: student.creditsCompleted, colour: 'var(--accent-green)' },
                  { label: 'Scheduled', val: student.scheduledCredits, colour: 'var(--accent-yellow)' },
                ] as const).map(row => (
                  <div key={row.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                      <span>{row.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {row.val}
                      </span>
                    </div>
                    <div style={{ background: '#1a1a1a', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: row.colour,
                        width: `${Math.min(100, (row.val / (student.creditsRequired || 1)) * 100)}%`,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
