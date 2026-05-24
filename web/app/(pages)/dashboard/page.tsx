'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { usePortalAuth } from '../../../components/providers/PortalAuthContext';
import { useScraperContext } from '../../../components/providers/ScraperContext';
import type { ScrapedStudent, ScrapedCourseListItem } from '../../../../core/shared/types/student';
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
  const [importMode, setImportMode] = useState<'xlsx' | 'manual' | 'paste'>('xlsx');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importIntakeYear, setImportIntakeYear] = useState(new Date().getFullYear());
  const [importIntakeSem, setImportIntakeSem] = useState<1 | 2>(1);
  const [manualUnits, setManualUnits] = useState<ScrapedCourseListItem[]>([]);
  const [manualUnitForm, setManualUnitForm] = useState({ courseId: '', courseTitle: '', credits: '', grade: '', term: '', status: 'Complete' });
  const [unitSuggestions, setUnitSuggestions] = useState<{ unit_code: string; unit_name: string }[]>([]);
  const [showUnitSuggestions, setShowUnitSuggestions] = useState(false);
  const unitSuggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [dataSource, setDataSource] = useState<'scrape' | 'import_xlsx' | 'import_manual' | 'import_paste'>('scrape');
  const [isImported, setIsImported] = useState(false);
  const [customPlan, setCustomPlan] = useState<any>(null);
  const [customPlanStart, setCustomPlanStart] = useState<{ year: number; semester: 1 | 2 } | null>(null);
  const [customPlanLoading, setCustomPlanLoading] = useState(false);
  const [injectedMinors, setInjectedMinors] = useState<Set<string>>(new Set());

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

  // When the selected planner changes, open all year-semester groups and reset custom plan
  useEffect(() => {
    const planner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!planner?.units) return;
    const keys = new Set<string>(planner.units.map((u: any) => `${u.year_level}-${u.semester}`));
    setOpenYears(keys);
    setCustomPlan(null);
    setCustomPlanStart(null);
    setInjectedMinors(new Set());
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
      const isNotFailed = (c: { grade?: string }) => c.grade?.trim().toUpperCase() !== 'N';
      const mpuCompleted = mpuCourseList.filter(isNotFailed).map((c) => c.courseId);
      const completedUnits = [
        ...new Set([
          ...student.courseList.filter(isNotFailed).map((c) => c.courseId),
          ...mpuCompleted
        ])
      ];

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
      setDataSource('import_xlsx');
      setScrapedStudent({ student, studentId: 'imported' });
      await fetchDashboardData('imported', student);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleUnitInputChange = (value: string) => {
    setManualUnitForm((f) => ({ ...f, courseId: value.toUpperCase() }));
    if (unitSuggestionsTimerRef.current) clearTimeout(unitSuggestionsTimerRef.current);
    if (value.trim().length < 2) { setUnitSuggestions([]); setShowUnitSuggestions(false); return; }
    unitSuggestionsTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/units?q=${encodeURIComponent(value)}`);
        if (!res.ok) return;
        const data = await res.json();
        setUnitSuggestions(data);
        setShowUnitSuggestions(data.length > 0);
      } catch {}
    }, 200);
  };

  const handleSelectUnitSuggestion = (unit: { unit_code: string; unit_name: string }) => {
    setShowUnitSuggestions(false);
    setUnitSuggestions([]);
    const code = unit.unit_code;
    if (manualUnits.some((u) => u.courseId === code)) { showToast('Unit code already added.', 'error'); return; }
    setManualUnits((prev) => [...prev, { courseId: code, courseTitle: unit.unit_name, level: '', credits: 3, creditsEarned: 3, status: 'Complete', grade: '', term: '' }]);
    setManualUnitForm((f) => ({ ...f, courseId: '' }));
  };

  const handleAddUnit = () => {
    const { courseId } = manualUnitForm;
    if (!courseId.trim()) { showToast('Unit code is required.', 'error'); return; }
    const code = courseId.trim().toUpperCase();
    if (manualUnits.some((u) => u.courseId === code)) { showToast('Unit code already added.', 'error'); return; }
    setManualUnits((prev) => [...prev, {
      courseId: code,
      courseTitle: '',
      level: '',
      credits: 3,
      creditsEarned: 3,
      status: 'Complete',
      grade: '',
      term: '',
    }]);
    setManualUnitForm({ courseId: '', courseTitle: '', credits: '', grade: '', term: '', status: 'Complete' });
  };

  const handleRemoveUnit = (index: number) => {
    setManualUnits((prev) => prev.filter((_, i) => i !== index));
  };

  const buildStudentFromCourseList = (courseList: ScrapedCourseListItem[]): ScrapedStudent => {
    const creditsCompleted = courseList
      .filter((c) => c.status === 'Complete')
      .reduce((sum, c) => sum + (c.creditsEarned || 0), 0);
    const scheduledCredits = courseList
      .filter((c) => c.status === 'Current')
      .reduce((sum, c) => sum + (c.credits || 0), 0);
    const intakeMonth = importIntakeSem === 1 ? 2 : 8;
    const enrollmentDate = `01/${String(intakeMonth).padStart(2, '0')}/${importIntakeYear}`;
    return { course: '', status: 'Active', cgpa: 0, creditsRequired: 0, creditsCompleted, gradeLevel: '', enrollmentDate, graduationDate: null, scheduledCredits, courseList };
  };

  const handleImportManual = async () => {
    if (manualUnits.length === 0) { showToast('Add at least one unit.', 'error'); return; }
    setStudentLoaded(false); setScrapedStudent(null); setDashboardData(null);
    setScraperApiStatus('idle'); setSelectedPlannerIdx(0); setManualPlanner(null);
    setShowPlannerPicker(false); setShowImportPanel(false); setIsImported(false);
    setInternalLoading(true);
    try {
      const student = buildStudentFromCourseList(manualUnits);
      setIsImported(true);
      setDataSource('import_manual');
      setScrapedStudent({ student, studentId: 'imported' });
      await fetchDashboardData('imported', student);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleImportPaste = async () => {
    if (!pasteText.trim()) { showToast('Paste some data first.', 'error'); return; }
    const lines = pasteText.trim().split('\n').filter((l) => l.trim());
    const courseList: ScrapedCourseListItem[] = [];
    for (const line of lines) {
      const cells = line.split('\t').map((c) => c.trim());
      const code = cells[0];
      if (!code || /^(course|unit\s*code|code|courseid)/i.test(code)) continue;
      // Columns: Code(0) · Title(1) · Credits(2) · Earned(3) · Status(4) · Grade(5) · Term(6)
      const credits = parseFloat(cells[2] ?? '') || 0;
      const earned  = parseFloat(cells[3] ?? '') || 0;
      const status  = cells[4] || 'Complete';
      const grade   = cells[5] ?? '';
      const term    = cells[6] ?? '';
      courseList.push({ courseId: code.toUpperCase(), courseTitle: cells[1] ?? '', level: '', credits, creditsEarned: earned, status, grade, term });
    }
    if (courseList.length === 0) { showToast('No valid rows found. Check your paste format.', 'error'); return; }
    setStudentLoaded(false); setScrapedStudent(null); setDashboardData(null);
    setScraperApiStatus('idle'); setSelectedPlannerIdx(0); setManualPlanner(null);
    setShowPlannerPicker(false); setShowImportPanel(false); setIsImported(false);
    setInternalLoading(true);
    try {
      const student = buildStudentFromCourseList(courseList);
      setIsImported(true);
      setDataSource('import_paste');
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
    setDataSource('scrape');
    setCustomPlan(null);
    setCustomPlanStart(null);
    setInjectedMinors(new Set());
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
    setDataSource('scrape');
    setManualUnits([]);
    setPasteText('');
    setCustomPlan(null);
    setCustomPlanStart(null);
    setInjectedMinors(new Set());
    try { sessionStorage.removeItem('dashboardSession'); } catch {}
    showToast('Student data cleared.', 'info');
  };

  const generateCustomPlan = async (overrideInjections?: Set<string>) => {
    const effectiveInjections = overrideInjections ?? injectedMinors;
    const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!activePlanner || !dashboardData) return;

    const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
    const mpuCourseList: any[] = dashboardData.mpuCourseList ?? [];

    // Only exclude Complete and Current — Future pre-enrollments go back into
    // the pool so the scheduler can repack them as the single source of truth.
    const completedForScheduler = [
      ...courseList.filter((u: any) => u.status === 'Complete' || u.status === 'Current').map((u: any) => u.courseId),
      ...mpuCourseList.filter((u: any) => u.status === 'Complete' || u.status === 'Current').map((u: any) => u.courseId),
    ].filter(Boolean);

    const plannerUnits: any[] = activePlanner.units ?? [];

    // Anchor start semester on Current units only.
    // Using max(Complete ∪ Current) would jump past Year 3 Sem 2 if the
    // student completed any out-of-sequence unit that the planner places there.
    const currentOnlyCodes = new Set(
      courseList
        .filter((u: any) => u.status === 'Current')
        .map((u: any) => u.courseId?.trim().toUpperCase())
        .filter(Boolean)
    );

    const activeTermUnits = plannerUnits.filter(
      (u: any) => u.unit && currentOnlyCodes.has(u.unit.unit_code?.trim().toUpperCase())
    );

    let startYear = 1;
    let startSemester: 1 | 2 = 1;

    if (activeTermUnits.length > 0) {
      // Start immediately after the semester the student is currently enrolled in
      const maxYear = Math.max(...activeTermUnits.map((u: any) => u.year_level));
      const maxSemInYear = Math.max(
        ...activeTermUnits.filter((u: any) => u.year_level === maxYear).map((u: any) => u.semester)
      );
      if (maxSemInYear === 1) {
        startYear = maxYear;
        startSemester = 2;
      } else {
        startYear = maxYear + 1;
        startSemester = 1;
      }
    } else {
      // No Current units — fall back to the semester after the last Complete unit
      const completeCodes = new Set(
        courseList
          .filter((u: any) => u.status === 'Complete')
          .map((u: any) => u.courseId?.trim().toUpperCase())
          .filter(Boolean)
      );
      const completedPlannerUnits = plannerUnits.filter(
        (u: any) => u.unit && completeCodes.has(u.unit.unit_code?.trim().toUpperCase())
      );
      if (completedPlannerUnits.length > 0) {
        const maxYear = Math.max(...completedPlannerUnits.map((u: any) => u.year_level));
        const maxSemInYear = Math.max(
          ...completedPlannerUnits.filter((u: any) => u.year_level === maxYear).map((u: any) => u.semester)
        );
        startYear = maxSemInYear === 1 ? maxYear : maxYear + 1;
        startSemester = maxSemInYear === 1 ? 2 : 1;
      } else {
        // Student has no history at all — start from the planner's first slot
        const allYearSems = [...new Set(plannerUnits.map((u: any) => `${u.year_level}-${u.semester}`))].sort();
        if (allYearSems.length > 0) {
          const [y, s] = (allYearSems[0] as string).split('-');
          startYear = parseInt(y);
          startSemester = parseInt(s) as 1 | 2;
        }
      }
    }

    setCustomPlanLoading(true);
    try {
      const res = await fetch('/api/custom-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerId: activePlanner.id,
          completedUnitCodes: completedForScheduler,
          startYear,
          startSemester,
          injectedMinorIds: [...effectiveInjections],
        }),
      });
      if (!res.ok) { showToast('Failed to generate custom pathway.', 'error'); return; }
      const data = await res.json();
      if (data.success) {
        setCustomPlan(data.data);
        setCustomPlanStart({ year: startYear, semester: startSemester });
      } else {
        showToast('Failed to generate custom pathway.', 'error');
      }
    } catch {
      showToast('Failed to generate custom pathway.', 'error');
    } finally {
      setCustomPlanLoading(false);
    }
  };

  const toggleMinorInjection = (minorId: string) => {
    const next = new Set(injectedMinors);
    if (next.has(minorId)) next.delete(minorId); else next.add(minorId);
    setInjectedMinors(next);
    // If a plan is already showing, regenerate immediately with the new set
    if (customPlan) generateCustomPlan(next);
  };

  return (
    <div className={styles.panel}>
      {/* ── Import trigger bar ──────────────────────────────────────────── */}
      {!studentLoaded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            className={styles.btnPrimary}
            onClick={() => setShowImportPanel((v) => !v)}
            disabled={loading}
          >
            Import Student Data
          </button>
        </div>
      )}

      {/* ── Import Panel ─────────────────────────────────────────────────── */}
      {showImportPanel && (
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: 4, padding: '14px 16px', marginBottom: 14, background: 'var(--card-bg)' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['xlsx', 'manual', 'paste'] as const).map((mode) => (
              <button key={mode} onClick={() => setImportMode(mode)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 3, border: '1px solid var(--panel-border)', background: importMode === mode ? 'var(--accent-blue, #2563eb)' : 'transparent', color: importMode === mode ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: importMode === mode ? 600 : 400 }}>
                {mode === 'xlsx' ? 'Upload Excel' : mode === 'manual' ? 'Add Units' : 'Paste Table'}
              </button>
            ))}
          </div>

          {/* Shared intake fields */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Intake Year</div>
              <input className={`${styles.formInput} ${styles.formInputMono}`} type="number" min={2000} max={2100} value={importIntakeYear} onChange={(e) => setImportIntakeYear(parseInt(e.target.value) || new Date().getFullYear())} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Intake Sem</div>
              <select className={styles.enrollSelect} value={importIntakeSem} onChange={(e) => setImportIntakeSem(parseInt(e.target.value) as 1 | 2)}>
                <option value={1}>Sem 1</option>
                <option value={2}>Sem 2</option>
              </select>
            </div>
          </div>

          {/* Tab: Upload Excel */}
          {importMode === 'xlsx' && (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Results File (.xlsx) <span style={{ color: 'var(--accent-red)' }}>*</span></div>
                <input type="file" accept=".xlsx" style={{ fontSize: 12, color: 'var(--text-primary)' }} onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
                {importFile && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{importFile.name}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className={styles.btnSecondary} onClick={() => setShowImportPanel(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleImport} disabled={!importFile}>Load</button>
              </div>
            </>
          )}

          {/* Tab: Add Units (individual entry) */}
          {importMode === 'manual' && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Unit Code or Name</div>
                  <input
                    className={`${styles.formInput} ${styles.formInputMono}`}
                    style={{ width: '100%' }}
                    placeholder="e.g. BACS2003 or Data Structures"
                    value={manualUnitForm.courseId}
                    onChange={(e) => handleUnitInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { setShowUnitSuggestions(false); handleAddUnit(); }
                      if (e.key === 'Escape') setShowUnitSuggestions(false);
                    }}
                    onBlur={() => setTimeout(() => setShowUnitSuggestions(false), 150)}
                    onFocus={() => unitSuggestions.length > 0 && setShowUnitSuggestions(true)}
                    autoComplete="off"
                  />
                  {showUnitSuggestions && unitSuggestions.length > 0 && (
                    <div className={styles.suggestionsList} style={{ top: '100%', zIndex: 20 }}>
                      {unitSuggestions.map((u) => (
                        <div
                          key={u.unit_code}
                          className={styles.suggestionItem}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectUnitSuggestion(u); }}
                        >
                          <span className={styles.suggestionId}>{u.unit_code}</span>
                          {u.unit_name && <span className={styles.suggestionName}>{u.unit_name}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className={styles.btnPrimary} onClick={() => { setShowUnitSuggestions(false); handleAddUnit(); }}>+ Add</button>
              </div>
              {manualUnits.length > 0 && (
                <div style={{ border: '1px solid var(--panel-border)', borderRadius: 3, marginBottom: 8, maxHeight: 180, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px' }}>
                  {manualUnits.map((u, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--card-bg)', border: '1px solid var(--panel-border)', borderRadius: 3, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                      {u.courseId}
                      <button onClick={() => handleRemoveUnit(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                {manualUnits.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{manualUnits.length} unit{manualUnits.length !== 1 ? 's' : ''}</span>}
                <button className={styles.btnSecondary} onClick={() => setShowImportPanel(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleImportManual} disabled={manualUnits.length === 0}>Load</button>
              </div>
            </>
          )}

          {/* Tab: Paste Table */}
          {importMode === 'paste' && (
            <>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Paste from Excel or student portal</div>
                {/* Column reference header */}
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 60px 80px 55px 110px', gap: 0, marginBottom: 2, border: '1px solid var(--panel-border)', borderRadius: '3px 3px 0 0', overflow: 'hidden' }}>
                  {[['#1', 'Course'], ['#2', 'Course Title'], ['#3', 'Credits'], ['#4', 'Earned'], ['#5', 'Status'], ['#6', 'Grade'], ['#7', 'Term']].map(([num, label]) => (
                    <div key={num} style={{ padding: '3px 6px', background: 'var(--card-bg)', borderRight: '1px solid var(--panel-border)' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.2 }}>{num}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                    </div>
                  ))}
                </div>
                <textarea
                  className={styles.formInput}
                  style={{ width: '100%', minHeight: 140, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', boxSizing: 'border-box', borderRadius: '0 0 3px 3px', borderTop: 'none' }}
                  placeholder={'COS10003\tComputer and Logic Essentials\t12.5\t12.5\tComplete\tHD\t2024_FEB_S1\nCOS30015\tIT Security\t12.5\t0\tCurrent\t\t2026_MAR_S1\nCOS10022\tData Science Principles\t12.5\t0\tFuture\t\t'}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Header row is auto-skipped. Empty Grade and Term cells are allowed.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className={styles.btnSecondary} onClick={() => setShowImportPanel(false)}>Cancel</button>
                <button className={styles.btnPrimary} onClick={handleImportPaste} disabled={!pasteText.trim()}>Load</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Import action bar — shown instead of identity card for imports */}
      {isImported && studentLoaded && dashboardData && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
          <button className={styles.btnSecondary} onClick={() => { setShowImportPanel((v) => !v); }}>Import Again</button>
          <button className={styles.btnSecondary} onClick={() => setShowExportModal(true)}>Export</button>
          <button className={styles.btnDanger} onClick={handleClear}>✕ Clear</button>
        </div>
      )}

      {/* ── Loading state ──────────────────────────────────────────────── */}
      {loading && !scrapedStudent && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div className={styles.spinner} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Loading...</div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !studentLoaded && !showImportPanel && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, opacity: 0.25 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Import student data to begin</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Use the Import button to load a student&apos;s academic record.</div>
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
         
        {/* --- LOGIC FOR GRADUATION CHECK --- */}
        const matchPayload = dashboardData.match;
        const totalCredits = matchPayload.totalCredits || 0;
        const missingCoreCount = matchPayload.unmatchedCore?.length || 0;
        const isGraduationReady = missingCoreCount === 0 && totalCredits >= 300;

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
          <div className={styles.sectionTitle}>Analytics & Graduation Check</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>

            {/* Not Yet Taken */}
            {(() => {
            const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
            
            const allStudentUnits = [
              ...(scrapedStudent?.student?.courseList ?? []),
              ...(dashboardData?.mpuCourseList ?? [])
            ];
            
            const doneCodes = new Set(allStudentUnits.filter(u => u.status === 'Complete' && u.grade?.trim().toUpperCase() !== 'N').map(u => u.courseId));
            const doingCodes = new Set(allStudentUnits.filter(u => u.status === 'Current' && u.grade?.trim().toUpperCase() !== 'N').map(u => u.courseId));

            const notTaken = (activePlanner?.units ?? [])
              .filter((u: any) => 
                u.unit !== null && 
                !doneCodes.has(u.unit.unit_code) && 
                !doingCodes.has(u.unit.unit_code)
              )
              .map((u: any) => ({ 
                code: u.unit.unit_code, 
                name: u.unit.unit_name, 
                category: u.category,
                offering: u.semester 
              }));

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
                      <InlineCode red={u.category === 'core'}>{u.code}</InlineCode>
                      <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {u.name} <span style={{ fontSize: '9px', opacity: 0.6 }}>[Sem {u.offering}]</span>
                      </span>
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

            {/* Graduation Status */}
            {(() => {
              const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
              if (!activePlanner) return null;

              const transcriptCodes = new Set(
                  [...(scrapedStudent?.student?.courseList ?? []), ...(dashboardData?.mpuCourseList ?? [])]
                      .filter(u => u.status === 'Complete' && u.grade?.trim().toUpperCase() !== 'N')
                      .map(u => u.courseId?.trim().toUpperCase())
                      .filter(Boolean)
              );

              //Count matches within the planner (Capping MPU to 1 slot)
              let completedInPlannerCount = 0;
              let mpuSlotFilled = false;
              const plannerCodes = new Set((activePlanner.units ?? []).map((u: any) => u.unit?.unit_code?.trim().toUpperCase()).filter(Boolean));

              plannerCodes.forEach((code: any) => {
                  if (transcriptCodes.has(code)) {
                      if (code.startsWith('MPU')) {
                          if (!mpuSlotFilled) { completedInPlannerCount += 1; mpuSlotFilled = true; }
                      } else {
                          completedInPlannerCount += 1;
                      }
                  }
              });

              const matchedCP = completedInPlannerCount * 12.5;

              const coreMissing = (activePlanner?.units ?? [])
                .filter((u: any) => u.unit !== null && (u.category === 'core' || u.category === 'major_core') && !transcriptCodes.has(u.unit.unit_code?.toUpperCase()));

              const prescribedMissing = (activePlanner?.units ?? [])
                .filter((u: any) => u.unit !== null && u.category === 'prescribed_elective' && !transcriptCodes.has(u.unit.unit_code?.toUpperCase()));

              const isEligible = (coreMissing.length + prescribedMissing.length === 0) && matchedCP >= 300;
              
              return (
                <div style={{ background: 'var(--card-bg)', border: `1px solid ${isEligible ? 'var(--accent-green)' : 'var(--accent-purple)'}`, borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Graduation Check</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isEligible ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: 8 }}>
                    {isEligible ? '✅ ELIGIBLE' : '❌ INELIGIBLE'}
                  </div>
                  
                  <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                          <div style={{ color: coreMissing.length === 0 ? 'var(--accent-green)' : 'inherit' }}>
                              {coreMissing.length === 0 ? '●' : '○'} Core & Major: {coreMissing.length === 0 ? 'Fulfilled' : <span style={{ fontWeight: 600 }}>{coreMissing.length} Remaining</span>}
                          </div>
                          {coreMissing.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 12 }}>
                                  {coreMissing.map((u: any) => (
                                      <InlineCode key={u.unit?.unit_code} red={true}>{u.unit?.unit_code}</InlineCode>
                                  ))}
                              </div>
                          )}
                      </div>

                      <div>
                          <div style={{ color: prescribedMissing.length === 0 ? 'var(--accent-green)' : 'inherit' }}>
                              {prescribedMissing.length === 0 ? '●' : '○'} Prescribed Electives: {prescribedMissing.length === 0 ? 'Fulfilled' : <span style={{ fontWeight: 600 }}>{prescribedMissing.length} Remaining</span>}
                          </div>
                          {prescribedMissing.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 12 }}>
                                  {prescribedMissing.map((u: any) => (
                                      <InlineCode key={u.unit?.unit_code} red={false}>{u.unit?.unit_code}</InlineCode>
                                  ))}
                              </div>
                          )}
                      </div>

                      <div style={{ fontSize:'12px', color: matchedCP >= 300 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                          {matchedCP >= 300 ? '●' : '○'} Credits: {matchedCP}/300 CP
                      </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <ProgressBar pct={Math.min((matchedCP / 300) * 100, 100)} color="var(--accent-purple)" />
                  </div>
                </div>
              );
          })()}
          </div>

          {/* Units Outside Planner */}
          {(() => {
            const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
            const plannerCodes = new Set(
              (activePlanner?.units ?? [])
                .map((u: any) => u.unit?.unit_code?.trim().toUpperCase())
                .filter(Boolean)
            );
            const allStudentUnits = [
              ...(scrapedStudent?.student?.courseList ?? []),
              ...(dashboardData?.mpuCourseList ?? []),
            ];
            const outsidePlanner = allStudentUnits.filter(
              (u) => u.courseId && !plannerCodes.has(u.courseId.trim().toUpperCase())
            );
            if (outsidePlanner.length === 0) return null;
            return (
              <div style={{ marginBottom: 16 }}>
                <div className={styles.sectionTitle}>Units Outside Planner</div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Unit Code</th>
                        <th>Unit Name</th>
                        <th>Status</th>
                        <th>Grade</th>
                        <th>Term</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outsidePlanner.map((u, i) => (
                        <tr key={i}>
                          <td><code className={styles.code}>{u.courseId}</code></td>
                          <td style={{ color: 'var(--text-muted)' }}>{u.courseTitle || '—'}</td>
                          <td>
                            <Badge
                              label={u.status}
                              cls={
                                u.status === 'Complete' ? 'badgeGreen'
                                : u.status === 'Current' ? 'badgeBlue'
                                : 'badgeYellow'
                              }
                            />
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.grade || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.term || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Dynamic Year-Semester Tables */}
          {(() => {
            const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData.planners?.[selectedPlannerIdx];
            const plannerUnits = activePlanner?.units ?? [];
            return [...new Set<string>(
              plannerUnits.map((u: any) => `${u.year_level}-${u.semester}`)
            )].sort();
          })().map((key) => {
            const [yearStr, semStr] = key.split('-');
            const year = parseInt(yearStr);
            const sem  = parseInt(semStr);
            const units = getUnitsByYearSem(year, sem);
            const open  = openYears.has(key);

            // A group is "superseded" when the custom plan has taken over scheduling
            // from that semester onwards — i.e. all its units are Future (none Complete/Current).
            const superseded = customPlan !== null && customPlanStart !== null && (
              year > customPlanStart.year ||
              (year === customPlanStart.year && sem >= customPlanStart.semester)
            );

            return (
              <div
                key={key}
                style={{
                  marginBottom: 8,
                  border: `1px solid ${superseded ? 'rgba(128,128,128,0.2)' : 'var(--panel-border)'}`,
                  borderRadius: 4,
                  overflow: 'hidden',
                  opacity: superseded ? 0.38 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <div onClick={() => toggleYearSem(key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-bg)', cursor: 'pointer' }}>
                  <span style={{ transition: '0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: superseded ? 'var(--text-muted)' : 'var(--accent-blue)' }}>
                    YEAR {year} · SEM {sem}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{units.length} units</span>
                  {superseded && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      superseded by custom plan
                    </span>
                  )}
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
                        {units.map((u: any) => {
                          const isFailed = u.grade?.trim().toUpperCase() === 'N';
                          return (
                          <tr key={u.code} style={
                            isFailed                              ? { background: 'rgba(244,135,113,0.15)' } :
                            u.status === 'Current'               ? { background: 'rgba(111,191,115,0.12)' } :
                            (!u.grade || u.grade === '—')        ? { background: 'rgba(244,135,113,0.08)' } :
                            undefined
                          }>
                            <td><InlineCode>{u.code}</InlineCode></td>
                            <td>{u.name}</td>
                            <td style={isFailed ? { color: 'var(--accent-red)', fontWeight: 600 } : undefined}>{u.grade}</td>
                            <td>{u.term}</td>
                            <td><Badge label={u.type} cls={u.typeClass as BadgeClass} /></td>
                            <td>{u.status}</td>
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

          {/* Minors & Specializations */}
          {(() => {
            const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
            const minors: any[] = activePlanner?.minors ?? [];
            if (minors.length === 0) return null;

            const doneCodes = new Set(
              [...(scrapedStudent?.student?.courseList ?? []), ...(dashboardData?.mpuCourseList ?? [])]
                .filter((u: any) => (u.status === 'Complete' || u.status === 'Current') && u.grade?.trim().toUpperCase() !== 'N')
                .map((u: any) => u.courseId?.trim().toUpperCase())
                .filter(Boolean)
            );

            // How many free elective slots the student still needs to fill
            const remainingElectiveSlots = (activePlanner?.units ?? []).filter(
              (u: any) => u.category === 'elective' &&
                (u.unit === null || !doneCodes.has(u.unit?.unit_code?.toUpperCase()))
            ).length;

            return (
              <div>
                <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Minors & Specializations</div>
                {minors.map((minor: any) => {
                  const total: number = minor.units.length;
                  const done: number = minor.units.filter(
                    (mu: any) => doneCodes.has(mu.unit?.unit_code?.trim().toUpperCase())
                  ).length;
                  const missing: number = total - done;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isInjected = injectedMinors.has(minor.id);
                  const wouldExceedCredits = missing > 0 && remainingElectiveSlots === 0;

                  return (
                    <div
                      key={minor.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: `1px solid ${isInjected ? 'rgba(197,134,192,0.6)' : 'rgba(197,134,192,0.3)'}`,
                        borderRadius: 4,
                        padding: '12px 14px',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{minor.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {done}/{total} units · {pct}% progress
                            {missing > 0 && (
                              <span style={{ color: 'var(--accent-orange)', marginLeft: 6 }}>{missing} remaining</span>
                            )}
                          </div>
                        </div>
                        {missing > 0 && (
                          <button
                            className={isInjected ? styles.btnDanger : styles.btnSecondary}
                            style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
                            onClick={() => toggleMinorInjection(minor.id)}
                            disabled={customPlanLoading}
                          >
                            {isInjected ? '✕ Remove from Plan' : '+ Include in Custom Plan'}
                          </button>
                        )}
                        {missing === 0 && (
                          <span style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 600 }}>✓ Complete</span>
                        )}
                      </div>
                      <ProgressBar pct={pct} color={pct === 100 ? 'var(--accent-green)' : 'var(--accent-yellow)'} />
                      {isInjected && (
                        <div style={{ fontSize: 10, color: 'var(--accent-purple)', marginTop: 6 }}>
                          {missing} missing unit{missing !== 1 ? 's' : ''} will be injected into the custom pathway.
                        </div>
                      )}
                      {wouldExceedCredits && (
                        <div style={{ fontSize: 10, color: 'var(--accent-orange)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>⚠</span>
                          <span>
                            {isInjected
                              ? 'No free elective slots remain — these units will exceed standard degree credits (extra units added to pathway).'
                              : 'Note: No free elective slots remain. Including this minor will exceed standard degree credits.'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Custom Study Pathway ─────────────────────────────────────── */}
          {(() => {
            const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
            if (!activePlanner) return null;

            const allTranscriptUnits = [
              ...(scrapedStudent?.student?.courseList ?? []),
              ...(dashboardData?.mpuCourseList ?? []),
            ];

            const completeCodes = new Set(
              allTranscriptUnits
                .filter((u: any) => u.status === 'Complete')
                .map((u: any) => u.courseId?.trim().toUpperCase())
                .filter(Boolean)
            );
            const currentCodes = new Set(
              allTranscriptUnits
                .filter((u: any) => u.status === 'Current')
                .map((u: any) => u.courseId?.trim().toUpperCase())
                .filter(Boolean)
            );
            // Units that are neither complete nor actively enrolled = truly unplanned
            const takenCodes = new Set([...completeCodes, ...currentCodes]);

            const isReqUnit = (u: any) =>
              u.unit !== null &&
              (u.category === 'core' || u.category === 'major_core' || u.category === 'prescribed_elective');

            const unplannedUnits = (activePlanner?.units ?? []).filter(
              (u: any) => isReqUnit(u) && !takenCodes.has(u.unit.unit_code?.toUpperCase())
            );
            const inProgressUnits = (activePlanner?.units ?? []).filter(
              (u: any) => isReqUnit(u) && currentCodes.has(u.unit.unit_code?.toUpperCase())
            );

            // Minor units the student has opted-in to but hasn't taken yet
            const injectedMinorMissingCount = (activePlanner?.minors ?? [])
              .filter((m: any) => injectedMinors.has(m.id))
              .reduce((sum: number, m: any) => {
                const missingFromMinor = m.units.filter(
                  (mu: any) => !takenCodes.has(mu.unit?.unit_code?.trim().toUpperCase())
                ).length;
                return sum + missingFromMinor;
              }, 0);

            const totalUnplanned = unplannedUnits.length + injectedMinorMissingCount;
            if (totalUnplanned === 0) return null;

            return (
              <div>
                <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Extended Study Plan</div>

                <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(244,135,113,0.35)', borderRadius: 4, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-orange)' }}>{totalUnplanned}</span> unplanned unit{totalUnplanned !== 1 ? 's' : ''}
                    {inProgressUnits.length > 0 && (
                      <span style={{ color: 'var(--accent-green)' }}> · {inProgressUnits.length} in progress this semester</span>
                    )}.{' '}
                    Generate a custom pathway to complete this degree.
                  </div>
                  <button
                    className={styles.btnPrimary}
                    style={{ fontSize: 12 }}
                    onClick={() => generateCustomPlan()}
                    disabled={customPlanLoading}
                  >
                    {customPlanLoading
                      ? 'Generating…'
                      : customPlan
                      ? 'Regenerate Pathway'
                      : 'Generate Custom Pathway'}
                  </button>
                </div>

                {customPlan && (
                  <div>
                    {customPlan.semesters.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
                        No semesters could be generated — all remaining units may have unresolvable prerequisite or offering conflicts.
                      </div>
                    ) : (
                      customPlan.semesters.map((sem: any) => (
                        <div
                          key={`cp-${sem.year}-${sem.semester}`}
                          style={{ marginBottom: 8, border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4, overflow: 'hidden' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(244,135,113,0.06)' }}>
                            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>
                              YEAR {sem.year} · SEM {sem.semester}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                              {sem.units.length} unit{sem.units.length !== 1 ? 's' : ''} · Custom
                            </span>
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                              <colgroup>
                                <col style={{ width: 110 }} />
                                <col style={{ width: 'auto' }} />
                                <col style={{ width: 200 }} />
                              </colgroup>
                              <thead>
                                <tr><th>Unit Code</th><th>Unit Name</th><th>Type</th></tr>
                              </thead>
                              <tbody>
                                {sem.units.map((u: any) => (
                                  <tr key={u.code}>
                                    <td>
                                      <InlineCode red={u.category === 'core' || u.category === 'major_core'}>
                                        {u.code}
                                      </InlineCode>
                                    </td>
                                    <td>{u.name}</td>
                                    <td>
                                      <Badge
                                        label={u.category === 'minor' ? 'minor elective' : u.category.replace(/_/g, ' ')}
                                        cls={
                                          u.category === 'core' ? 'badgeRed' :
                                          u.category === 'major_core' ? 'badgeOrange' :
                                          u.category === 'mpu' ? 'badgeBlue' :
                                          u.category === 'minor' ? 'badgeYellow' :
                                          'badgePurple'
                                        }
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))
                    )}

                    {customPlan.unschedulableUnits.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--accent-orange)', padding: '8px 2px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span>⚠</span>
                        <span>
                          {customPlan.unschedulableUnits.length} unit{customPlan.unschedulableUnits.length !== 1 ? 's' : ''} could
                          not be automatically scheduled due to prerequisite or semester-offering conflicts:{' '}
                          {customPlan.unschedulableUnits.map((u: any) => u.code).join(', ')}.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

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
          enrollmentMode: dataSource,
        };
        return <ExportModal exportInput={exportInput} onClose={() => setShowExportModal(false)} availableSections={isImported ? ['major_match', 'unit_plan', 'study_planner'] : undefined} />;
      })()}
    </div>
  );
}