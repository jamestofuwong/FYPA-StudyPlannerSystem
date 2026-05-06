'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { usePortalAuth } from '../../../components/providers/PortalAuthContext';
import { useScraperContext } from '../../../components/providers/ScraperContext';
import type { ScrapedStudent } from '../../../../core/shared/types/student';
import ExportModal from '../../../components/ExportModal';
import type { ExportInput } from '../../../../core/shared/types/export';


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
  const { isLoggedIn, isPortalLoading, openLoginModal } = usePortalAuth();
  const { fetchStudentSuggestions, phase: scraperPhase } = useScraperContext();
  const [studentIdInput, setStudentIdInput] = useState('');
  const [scrapedStudent, setScrapedStudent] = useState<{ student: ScrapedStudent; studentId: string } | null>(null);
  const [studentLoaded, setStudentLoaded] = useState(false);
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [scraperApiStatus, setScraperApiStatus] = useState<string>('idle');
  const [showExportModal, setShowExportModal] = useState(false);
  const [enrollmentMode, setEnrollmentMode] = useState<'latest' | 'earliest' | 'mpu'>('latest');
  const [selectedPlannerIdx, setSelectedPlannerIdx] = useState(0); // -1 = manual planner active
  const [manualPlanner, setManualPlanner] = useState<any>(null);
  const [showPlannerPicker, setShowPlannerPicker] = useState(false);
  const [plannerPickerSearch, setPlannerPickerSearch] = useState('');
  const [allPlanners, setAllPlanners] = useState<any[] | null>(null);
  const [suggestions, setSuggestions] = useState<{ text: string; id: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importIntakeYear, setImportIntakeYear] = useState(new Date().getFullYear());
  const [importIntakeSem, setImportIntakeSem] = useState<1 | 2>(1);
  const [isImported, setIsImported] = useState(false);

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

  // When the selected planner changes, open all year-semester groups
  useEffect(() => {
    const planner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!planner?.units) return;
    const keys = new Set<string>(planner.units.map((u: any) => `${u.year_level}-${u.semester}`));
    setOpenYears(keys);
  }, [selectedPlannerIdx, dashboardData, manualPlanner]);

  const loading = internalLoading;
  const isInitializing = scraperApiStatus === 'initializing';
  const isScraping = scraperApiStatus === 'scraping';
  const isWaitingForList = scraperApiStatus === 'pending' || isInitializing;
  const isDisabled = !isLoggedIn || isPortalLoading || isInitializing || loading;

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
  const fetchDashboardData = async (studentId: string, student: ScrapedStudent, mpuCourseList: any[] = []) => {
    try {
      const mpuCompleted = mpuCourseList.filter((c) => c.grade === 'COMP').map((c) => c.courseId);
      const completedUnits = [...new Set([...student.courseList.map((c) => c.courseId), ...mpuCompleted])];

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

      // 2. Fetch the top-3 ranked planner templates from DB in parallel
      const top3 = matchData.data.rankedPlanners.slice(0, 3);
      if (top3.length === 0) {
        showToast("No matching planner found for this student.", "error");
        return;
      }
      const plannerResponses = await Promise.all(
        top3.map((r: any) => fetch(`/api/planners/${r.plannerID}`))
      );
      const plannerDataArr = await Promise.all(plannerResponses.map((r) => r.json()));

      if (plannerResponses[0].ok) {
        const data = {
          match: matchData.data,
          planners: plannerDataArr,
          completedCodes: completedUnits,
          intakeYear,
          student,
          studentId,
          enrollmentMode,
          mpuCourseList,
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
  const getUnitsByYearSem = (yearLevel: number, semester: number) => {
    const planner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!planner?.units) return [];

    const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
    const mpuCourseList: any[] = dashboardData.mpuCourseList ?? [];

    const gradeMap  = new Map<string, string>(courseList.map((c) => [c.courseId, c.grade]));
    const statusMap = new Map<string, string>(courseList.map((c) => [c.courseId, c.status]));
    const termMap   = new Map<string, string>(courseList.map((c) => [c.courseId, c.term]));

    const mpuGradeMap  = new Map<string, string>(mpuCourseList.map((c) => [c.courseId, c.grade]));
    const mpuStatusMap = new Map<string, string>(mpuCourseList.map((c) => [c.courseId, c.status]));
    const mpuTermMap   = new Map<string, string>(mpuCourseList.map((c) => [c.courseId, c.term]));

    return planner.units
      .filter((u: any) => u.year_level === yearLevel && u.semester === semester && u.unit !== null)
      .map((u: any) => ({
        code: u.unit.unit_code,
        name: u.unit.unit_name,
        grade:  gradeMap.get(u.unit.unit_code)  ?? mpuGradeMap.get(u.unit.unit_code)  ?? '—',
        term:   termMap.get(u.unit.unit_code)   ?? mpuTermMap.get(u.unit.unit_code)   ?? '—',
        type: u.category.replace('_', ' '),
        typeClass: u.category === 'core' ? 'badgeRed' : 'badgePurple',
        status: statusMap.get(u.unit.unit_code) ?? mpuStatusMap.get(u.unit.unit_code) ?? '—',
      }));
  };

  // Scrapes the MPU enrollment for a student if it exists and the current enrollment is not MPU.
  // Returns the MPU courseList so it can be used to supplement completedCodes for matching.
  const fetchMpuCourseList = async (id: string, mainStudent: ScrapedStudent): Promise<any[]> => {
    const isAlreadyMpu = (mainStudent.selectedEnrollment ?? '').includes('Mata Pelajaran Umum');
    if (isAlreadyMpu) return [];
    const mpuOption = mainStudent.enrollmentOptions?.find((o) => o.text.includes('Mata Pelajaran Umum'));
    if (!mpuOption) return [];
    const startRes = await fetch('/api/scraper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id, enrollmentMode: 'by-text', enrollmentText: mpuOption.text }),
    }).catch(() => null);
    if (!startRes?.ok) return [];
    const mpuStudent = await pollScraperResult();
    return mpuStudent?.courseList ?? [];
  };

  const handleSwitchEnrollment = (enrollmentText: string) => {
    const id = studentIdInput.trim();
    if (!id) return;
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedStudentName('');
    setStudentLoaded(false);
    setScrapedStudent(null);
    setDashboardData(null);
    setScraperApiStatus('idle');
    setSelectedPlannerIdx(0);
    setManualPlanner(null);
    setShowPlannerPicker(false);
    setInternalLoading(true);
    fetch('/api/scraper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id, enrollmentMode: 'by-text', enrollmentText }),
    }).then(async (startRes) => {
      if (!startRes.ok) { showToast('Failed to queue scrape.', 'error'); setInternalLoading(false); return; }
      const scraped = await pollScraperResult();
      if (!scraped) { setInternalLoading(false); return; }
      setScrapedStudent({ student: scraped, studentId: id });
      const mpuCourseList = await fetchMpuCourseList(id, scraped);
      await fetchDashboardData(id, scraped, mpuCourseList);
      setInternalLoading(false);
    }).catch(() => { showToast('Failed to fetch data.', 'error'); setInternalLoading(false); });
  };

  const openPlannerPicker = async () => {
    setShowPlannerPicker((v) => !v);
    if (!allPlanners) {
      const res = await fetch('/api/planners').catch(() => null);
      if (res?.ok) setAllPlanners(await res.json());
    }
  };

  const selectManualPlanner = async (plannerId: string) => {
    const res = await fetch(`/api/planners/${plannerId}`).catch(() => null);
    if (!res?.ok) { showToast('Failed to fetch planner.', 'error'); return; }
    const data = await res.json();
    setManualPlanner(data);
    setSelectedPlannerIdx(-1);
    setShowPlannerPicker(false);
    setPlannerPickerSearch('');
  };

  const toggleYearSem = (key: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleInputChange = (value: string) => {
    setStudentIdInput(value);
    setSelectedStudentName('');
    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
    if (!value.trim() || scraperPhase !== 'ready') {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestionsTimerRef.current = setTimeout(async () => {
      const opts = await fetchStudentSuggestions(value.trim());
      setSuggestions(opts);
      setShowSuggestions(opts.length > 0);
    }, 300);
  };

  const handleSelectSuggestion = (id: string, name: string) => {
    setStudentIdInput(id);
    setSelectedStudentName(name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleImport = async () => {
    if (!importFile) { showToast('Select an xlsx file to import.', 'error'); return; }

    setStudentLoaded(false);
    setScrapedStudent(null);
    setDashboardData(null);
    setScraperApiStatus('idle');
    setSelectedPlannerIdx(0);
    setManualPlanner(null);
    setShowPlannerPicker(false);
    setShowImportPanel(false);
    setIsImported(false);
    setInternalLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error ?? 'Failed to parse file.', 'error');
        return;
      }
      const { courseList } = await res.json();

      const creditsCompleted = courseList
        .filter((c: any) => c.status === 'Complete')
        .reduce((sum: number, c: any) => sum + (c.creditsEarned || 0), 0);
      const scheduledCredits = courseList
        .filter((c: any) => c.status === 'Current')
        .reduce((sum: number, c: any) => sum + (c.credits || 0), 0);

      const intakeMonth = importIntakeSem === 1 ? 2 : 8;
      const enrollmentDate = `01/${String(intakeMonth).padStart(2, '0')}/${importIntakeYear}`;

      const student: ScrapedStudent = {
        course:           '',
        status:           'Active',
        cgpa:             0,
        creditsRequired:  0,
        creditsCompleted,
        gradeLevel:       '',
        enrollmentDate,
        graduationDate:   null,
        scheduledCredits,
        courseList,
      };

      setIsImported(true);
      setScrapedStudent({ student, studentId: 'imported' });
      await fetchDashboardData('imported', student);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleSearch = async () => {
    const id = studentIdInput.trim();
    if (!id) { showToast('Enter a Student ID.', 'error'); return; }
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedStudentName('');
    setStudentLoaded(false);
    setScrapedStudent(null);
    setDashboardData(null);
    setScraperApiStatus('idle');
    setSelectedPlannerIdx(0);
    setManualPlanner(null);
    setShowPlannerPicker(false);
    setIsImported(false);
    setInternalLoading(true);
    try {
      // 1. Queue the student ID for the scraper bot via API
      const startRes = await fetch('/api/scraper/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: id, enrollmentMode }),
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
      // 4. Scrape MPU enrollment to supplement completedCodes for matching
      const mpuCourseList = await fetchMpuCourseList(id, student);
      // 5. Fetch matching + planner data
      await fetchDashboardData(id, student, mpuCourseList);
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
    setManualPlanner(null);
    setShowPlannerPicker(false);
    setIsImported(false);
    try { sessionStorage.removeItem('dashboardSession'); } catch {}
    showToast('Student data cleared.', 'info');
  };

  return (
    <div className={styles.panel}>
      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔍</span>
        <div className={styles.suggestionsWrap}>
          <input
            className={`${styles.formInput} ${styles.formInputMono}`}
            value={studentIdInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowSuggestions(false); return; }
              if (e.key === 'Enter' && !isDisabled) handleSearch();
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={!isLoggedIn ? 'Log in to proceed' : isPortalLoading ? 'Logging in to portal…' : isInitializing ? 'Waiting for scraper…' : 'Student ID or name'}
            disabled={isDisabled}
          />
          {selectedStudentName && (
            <div className={styles.selectedName}>{selectedStudentName}</div>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className={styles.suggestionsList}>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={styles.suggestionItem}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s.id, s.name); }}
                >
                  <span className={styles.suggestionId}>{s.id}</span>
                  {s.name && <span className={styles.suggestionName}>{s.name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <select
          className={styles.enrollSelect}
          value={enrollmentMode}
          onChange={(e) => setEnrollmentMode(e.target.value as 'latest' | 'earliest' | 'mpu')}
          disabled={isDisabled}
        >
          <option value="latest">Latest</option>
          <option value="earliest">Earliest</option>
          <option value="mpu">MPU</option>
        </select>
        <button className={styles.btnPrimary} onClick={handleSearch} disabled={isDisabled}>
          Search
        </button>
        <button
          className={styles.btnSecondary}
          onClick={() => setShowImportPanel((v) => !v)}
          disabled={loading}
        >
          Import
        </button>
      </div>

      {/* ── Import Panel ─────────────────────────────────────────────────── */}
      {showImportPanel && (
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: 4, padding: '14px 16px', marginBottom: 14, background: 'var(--card-bg)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Import Results from xlsx</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Intake Year</div>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  style={{ width: '100%' }}
                  type="number"
                  min={2000}
                  max={2100}
                  value={importIntakeYear}
                  onChange={(e) => setImportIntakeYear(parseInt(e.target.value) || new Date().getFullYear())}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Intake Sem</div>
                <select
                  className={styles.enrollSelect}
                  style={{ width: '100%' }}
                  value={importIntakeSem}
                  onChange={(e) => setImportIntakeSem(parseInt(e.target.value) as 1 | 2)}
                >
                  <option value={1}>Sem 1</option>
                  <option value={2}>Sem 2</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Results File (.xlsx) <span style={{ color: 'var(--accent-red)' }}>*</span></div>
            <input
              type="file"
              accept=".xlsx"
              style={{ fontSize: 12, color: 'var(--text-primary)' }}
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
            {importFile && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{importFile.name}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className={styles.btnSecondary} onClick={() => setShowImportPanel(false)}>Cancel</button>
            <button className={styles.btnPrimary} onClick={handleImport} disabled={!importFile}>Load</button>
          </div>
        </div>
      )}

      {/* ── Import action bar — shown instead of identity card for imports */}
      {isImported && studentLoaded && dashboardData && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
          <button className={styles.btnSecondary} onClick={() => setShowExportModal(true)}>Export</button>
          <button className={styles.btnDanger} onClick={handleClear}>✕ Clear</button>
        </div>
      )}

      {/* ── Loading states ─────────────────────────────────────────────── */}
      {!isLoggedIn && !isPortalLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🔒</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Log in to proceed</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 14 }}>Connect to the student portal to search for students.</div>
          <button className={styles.btnPrimary} onClick={openLoginModal}>Log in to Portal</button>
        </div>
      )}

      {isPortalLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Logging in to portal...</div>
        </div>
      )}

      {!isPortalLoading && isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Loading student list...</div>
        </div>
      )}

      {!isPortalLoading && isScraping && !scrapedStudent && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Retrieving data...</div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {isLoggedIn && !isPortalLoading && !loading && !studentLoaded && !isWaitingForList && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Enter a Student ID to begin</div>
        </div>
      )}

      {/* ── Identity Card — shown only for scraped (not imported) results ─ */}
      {scrapedStudent && !isImported && (() => {
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
              {dashboardData && (
                <button className={styles.btnSecondary} onClick={() => setShowExportModal(true)}>Export</button>
              )}
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
            {(() => {
              const options = scrapedStudent?.student?.enrollmentOptions;
              if (!options || options.length === 0) return null;
              const current = scrapedStudent?.student?.selectedEnrollment;
              return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Enrolment</span>
                  {options.map((opt) => {
                    const active = opt.text === current;
                    return (
                      <button
                        key={opt.text}
                        onClick={() => !active && handleSwitchEnrollment(opt.text)}
                        disabled={loading}
                        style={{
                          fontSize: 11, padding: '2px 10px', borderRadius: 12, cursor: active ? 'default' : 'pointer',
                          border: active ? '1px solid var(--accent-blue)' : '1px solid var(--panel-border)',
                          background: active ? 'var(--active-bg, rgba(111,163,200,0.15))' : 'transparent',
                          color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >{opt.text}</button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Matching spinner — shown after scrape, before match result ─── */}
      {scrapedStudent && !dashboardData && loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Matching student to planner...</div>
        </div>
      )}

      {/* ── Dashboard Content ────────────────────────────────────────────── */}
      {!loading && studentLoaded && dashboardData && (() => {
        const isMpu = (scrapedStudent?.student?.selectedEnrollment ?? '').includes('Mata Pelajaran Umum');

        if (isMpu) {
          const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
          return (
            <div>
              <div className={styles.sectionTitle}>Course List</div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--panel-border)', borderRadius: 4 }}>
                <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: 110 }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: 60 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 110 }} />
                  </colgroup>
                  <thead>
                    <tr><th>Course ID</th><th>Course Title</th><th>Level</th><th>Credits</th><th>Earned</th><th>Status</th><th>Grade</th><th>Term</th></tr>
                  </thead>
                  <tbody>
                    {courseList.map((c: any, i: number) => (
                      <tr key={c.courseId ?? i}>
                        <td><InlineCode>{c.courseId}</InlineCode></td>
                        <td>{c.courseTitle}</td>
                        <td>{c.level ?? '—'}</td>
                        <td>{c.credits}</td>
                        <td>{c.creditsEarned}</td>
                        <td>{c.status}</td>
                        <td>{c.grade}</td>
                        <td>{c.term}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        return (
          <div>

          {/* Ranked Planners selector */}
          <div className={styles.sectionTitle}>Ranked Planners</div>
          {dashboardData.match.rankedPlanners.slice(0, 3).map((ranked: any, idx: number) => {
            const planner = dashboardData.planners[idx];
            const isSelected = selectedPlannerIdx === idx;
            const rankColor = idx === 0 ? 'var(--accent-blue)' : idx === 1 ? 'var(--accent-yellow)' : 'var(--accent-orange)';
            return (
              <div
                key={ranked.plannerID}
                onClick={() => setSelectedPlannerIdx(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  background: isSelected ? 'var(--active-bg)' : 'var(--card-bg)',
                  border: `1px solid ${isSelected ? 'var(--active-highlight)' : 'var(--panel-border)'}`,
                  borderRadius: 4, marginBottom: 6, cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: rankColor, fontFamily: 'var(--font-mono)', width: 20, flexShrink: 0 }}>#{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ranked.majorName || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {[
                      planner?.course?.name,
                      planner?.intake_year,
                      planner?.intake_month != null
                        ? new Date(2000, planner.intake_month - 1).toLocaleString('default', { month: 'long' })
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ width: 120, flexShrink: 0 }}>
                  <ProgressBar pct={ranked.matchPct} color={rankColor} />
                </div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: rankColor, width: 38, textAlign: 'right', flexShrink: 0 }}>
                  {ranked.matchPct}%
                </div>
              </div>
            );
          })}

          {/* Manual planner row */}
          {manualPlanner && (() => {
            const isSelected = selectedPlannerIdx === -1;
            const label = [manualPlanner.major?.name, manualPlanner.course?.name, manualPlanner.intake_year,
              manualPlanner.intake_month != null
                ? new Date(2000, manualPlanner.intake_month - 1).toLocaleString('default', { month: 'long' })
                : null,
            ].filter(Boolean).join(' · ');
            return (
              <div
                onClick={() => setSelectedPlannerIdx(-1)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: isSelected ? 'var(--active-bg)' : 'var(--card-bg)',
                  border: `1px solid ${isSelected ? 'var(--active-highlight)' : 'var(--panel-border)'}`,
                  borderRadius: 4, marginBottom: 6, cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)', width: 20, flexShrink: 0 }}>M</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{manualPlanner.major?.name ?? manualPlanner.course?.name ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                </div>
                <button
                  className={styles.btnDanger}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={(e) => { e.stopPropagation(); setManualPlanner(null); if (selectedPlannerIdx === -1) setSelectedPlannerIdx(0); }}
                >✕</button>
              </div>
            );
          })()}

          {/* Planner picker */}
          <div style={{ marginBottom: 12 }}>
            <button
              className={styles.btnSecondary}
              style={{ fontSize: 11, width: '100%' }}
              onClick={openPlannerPicker}
            >
              {showPlannerPicker ? '▲ Close planner search' : '▼ Match against a different planner'}
            </button>
            {showPlannerPicker && (
              <div style={{ marginTop: 6, border: '1px solid var(--panel-border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ padding: '6px 8px', background: 'var(--surface-bg)', borderBottom: '1px solid var(--panel-border)' }}>
                  <input
                    autoFocus
                    className={styles.formInput}
                    style={{ width: '100%', fontSize: 12 }}
                    placeholder="Search by course, major, or year..."
                    value={plannerPickerSearch}
                    onChange={(e) => setPlannerPickerSearch(e.target.value)}
                  />
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {allPlanners === null ? (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>
                  ) : (() => {
                    const q = plannerPickerSearch.toLowerCase();
                    const filtered = allPlanners.filter((p) =>
                      !q ||
                      p.course?.name?.toLowerCase().includes(q) ||
                      p.major?.name?.toLowerCase().includes(q) ||
                      String(p.intake_year).includes(q)
                    );
                    if (filtered.length === 0) return (
                      <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No planners found.</div>
                    );
                    return filtered.map((p: any) => (
                      <div
                        key={p.id}
                        onClick={() => selectManualPlanner(p.id)}
                        style={{
                          padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                          borderBottom: '1px solid var(--panel-border)',
                          background: manualPlanner?.id === p.id ? 'var(--active-bg)' : undefined,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = manualPlanner?.id === p.id ? 'var(--active-bg)' : '')}
                      >
                        <div style={{ fontWeight: 600 }}>{p.major?.name ?? p.course?.name ?? '—'}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {[p.course?.name, p.intake_year,
                            p.intake_month != null
                              ? new Date(2000, p.intake_month - 1).toLocaleString('default', { month: 'long' })
                              : null,
                            p._count?.units != null ? `${p._count.units} units` : null,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Fast Analytics */}
          <div className={styles.sectionTitle}>Analytics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>

            {/* Not Yet Taken */}
            {(() => {
              const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
              const completedSet = new Set<string>(dashboardData.completedCodes ?? []);
              const notTaken = (activePlanner?.units ?? [])
                .filter((u: any) => u.unit !== null && !completedSet.has(u.unit.unit_code))
                .map((u: any) => ({ code: u.unit.unit_code, name: u.unit.unit_name, category: u.category }));
              const coreCount = notTaken.filter((u: any) => u.category === 'core').length;
              const electiveCount = notTaken.filter((u: any) => u.category !== 'core').length;
              return (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Not Yet Taken</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{notTaken.length}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Core: {coreCount} · Elective: {electiveCount}</span>
                  </div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {notTaken.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>All planner units taken.</div>
                    ) : notTaken.map((u: any) => (
                      <div key={u.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <InlineCode>{u.code}</InlineCode>
                        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{u.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Currently Enrolled */}
            {(() => {
              const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
              const mpuCourseList: any[] = dashboardData.mpuCourseList ?? [];
              const seen = new Set<string>();
              const currentlyEnrolled = [...courseList, ...mpuCourseList].filter((c) => {
                if (c.status !== 'Current' || seen.has(c.courseId)) return false;
                seen.add(c.courseId);
                return true;
              });
              const totalCredits = currentlyEnrolled.reduce((sum: number, c: any) => sum + (c.credits || 0), 0);
              return (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Currently Enrolled</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{currentlyEnrolled.length}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalCredits} credits this term</span>
                  </div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {currentlyEnrolled.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No units currently enrolled.</div>
                    ) : currentlyEnrolled.map((c: any) => (
                      <div key={c.courseId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <InlineCode>{c.courseId}</InlineCode>
                        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.courseTitle}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          </div>

          {/* Dynamic Year-Semester Tables */}
          {(() => {
            const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData.planners?.[selectedPlannerIdx];
            const plannerUnits = activePlanner?.units ?? [];
            const groups = [...new Set<string>(
              plannerUnits.map((u: any) => `${u.year_level}-${u.semester}`)
            )].sort();
            return groups;
          })().map((key) => {
            const [yearStr, semStr] = key.split('-');
            const year = parseInt(yearStr);
            const sem  = parseInt(semStr);
            const units = getUnitsByYearSem(year, sem);
            const open  = openYears.has(key);
            return (
              <div key={key} style={{ marginBottom: 8, border: '1px solid var(--panel-border)', borderRadius: 4, overflow: 'hidden' }}>
                <div onClick={() => toggleYearSem(key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-bg)', cursor: 'pointer' }}>
                  <span style={{ transition: '0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>YEAR {year} · SEM {sem}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{units.length} units</span>
                </div>
                {open && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                      <colgroup>
                        <col style={{ width: 110 }} />
                        <col style={{ width: 'auto' }} />
                        <col style={{ width: 70 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 110 }} />
                      </colgroup>
                      <thead>
                        <tr><th>Unit Code</th><th>Unit Name</th><th>Grade</th><th>Term</th><th>Type</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {units.map((u: any) => (
                          <tr key={u.code} style={
                            u.status === 'Current' ? { background: 'rgba(111,191,115,0.12)' } :
                            (!u.grade || u.grade === '—') ? { background: 'rgba(244,135,113,0.08)' } :
                            undefined
                          }>
                            <td><InlineCode>{u.code}</InlineCode></td>
                            <td>{u.name}</td>
                            <td>{u.grade}</td>
                            <td>{u.term}</td>
                            <td><Badge label={u.type} cls={u.typeClass as BadgeClass} /></td>
                            <td>{u.status}</td>
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
        );
      })()}

      {/* ── Export Modal ─────────────────────────────────────────────────── */}
      {showExportModal && dashboardData && scrapedStudent && (() => {
        const selectedPlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData.planners[selectedPlannerIdx];
        const exportInput: Omit<ExportInput, 'options'> = {
          studentId: scrapedStudent.studentId,
          student: scrapedStudent.student,
          match: dashboardData.match,
          planner: {
            course: selectedPlanner.course,
            major: selectedPlanner.major ?? null,
            units: selectedPlanner.units,
            intakeMonth: selectedPlanner.intake_month ?? null,
          },
          completedCodes: dashboardData.completedCodes,
          intakeYear: selectedPlanner.intake_year ?? dashboardData.intakeYear,
          mpuCourseList: dashboardData.mpuCourseList ?? [],
        };
        return <ExportModal exportInput={exportInput} onClose={() => setShowExportModal(false)} availableSections={isImported ? ['major_match', 'unit_plan', 'study_planner'] : undefined} />;
      })()}
    </div>
  );
}