'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useScrollToTopOnMount } from '../../../lib/scrollToTop';
import styles from './page.module.css';
import ui from './components/ui.module.css';
import { DataTable } from './components/DataTable';
import { Step, Tabs, Figure } from './components/Layout';
import { DEFAULT_CLASS_ESTIMATION_CONFIG } from '../../../../core/shared/types/classEstimation';
import type { EstimationPreview } from '../../../../core/services/classEstimation/estimationPreview';
import { describeAcademicNow } from '../../../../core/services/classEstimation/academicCalendar';
import {
  parseStoredRetentionRate,
  parseTypedRetentionPercent,
  retentionRateToPercent,
} from '../../../../core/services/classEstimation/retention';

/** What /api/class-estimation/preview returns: the preview itself plus the semester it was run for. */
type PreviewResponse = EstimationPreview & {
  target: { year: number | null; semester: 1 | 2; label: string; reason: string; overridden: boolean };
};

type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';
type RunStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * Where transcripts come from. Portal and mock both run the scrape flow, mock without a login. Imported
 * reads DPA files instead, which is the path demonstrated to the panel, since scraping is not shown there.
 */
type SourceId = 'portal' | 'mock' | 'import';

type SourceOption = { id: SourceId; label: string; requiresLogin: boolean; hint: string };

type ImportedStudent = {
  studentId: string;
  unitCount: number;
  intakeYear: number;
  intakeSemester: 1 | 2;
  warnings: string[];
};

type ImportedFile = {
  filename: string;
  ok: boolean;
  students: ImportedStudent[];
  rowWarnings: string[];
  error?: string;
};

type ImportResult = {
  preview: boolean;
  files: ImportedFile[];
  totalFiles: number;
  filesFailed: number;
  totalStudents: number;
  storedStudents: number;
};

/** A saved estimation run, as /api/class-estimation/runs returns it. */
type SavedRun = {
  id: string;
  createdAt: string;
  label: string | null;
  targetYear: number;
  targetSemester: number;
  loadCap: number;
  retentionRate: number;
  newIntake: number;
  source: string;
  studentCount: number;
  groupCount: number;
  commonCoreCount: number;
  unitCount: number;
  totalHeadcount: number;
};

type SavedRunDetail = SavedRun & {
  units: Array<{
    unitCode: string;
    fromNamedPicks: number;
    fromElectives: number;
    fromNewIntake: number;
    projected: number;
    headcount: number;
  }>;
};

type ProgressState = {
  current: number;
  total: number;
  studentName: string;
  phase: 'enrollments' | 'audit' | string;
};

type Summary = {
  completed: number;
  failed: number;
  skipped: number;
  total: number;
};

type LogEntry = {
  key: number;
  type: 'done' | 'error' | 'skip';
  text: string;
};

const PHASE_LABEL: Record<string, string> = {
  enrollments: 'Fetching enrollments…',
  audit:       'Fetching degree audit…',
};

/** Where the HoD's retention figure is kept, allowlisted in web/app/api/config/route.ts. */
const RETENTION_KEY = 'class_estimation_retention_rate';
const NEW_INTAKE_KEY = 'class_estimation_new_intake';

let _logKey = 0;

/** The tabs results are split across, so only one long list is ever on screen. */
type ResultsTab = 'units' | 'electives' | 'students' | 'checks';
type StudentFilter = 'all' | 'major' | 'commonCore' | 'notEstimated' | 'error';

const DEFAULT_LOAD_CAP = DEFAULT_CLASS_ESTIMATION_CONFIG.loadCap;

/** Where students came from, in words rather than the internal source ids. */
const SOURCE_NAMES: Record<string, string> = {
  portal: 'the portal',
  import: 'DPA files',
  mock: 'generated test data',
  mixed: 'several sources',
};

const ELECTIVE_TYPE: Record<string, string> = {
  prescribed: 'Prescribed',
  freeElective: 'Free',
  mixed: 'Both',
};

/**
 * What the page was showing, kept so leaving for the Head of Department view and coming back does not throw
 * the last run away. Next.js unmounts a page on navigation, and every useState below goes with it.
 *
 * Module-level on purpose rather than sessionStorage. The preview holds student IDs and names, and
 * REQ-SEC-101 keeps student data in RAM only, the same rule the dashboard follows. A module variable is RAM:
 * it survives moving between pages and is gone on reload or when the app closes, which is what the
 * lifetime the server-side estimation store already has.
 */
type EstimatorMemory = {
  runStatus: RunStatus;
  progress: ProgressState | null;
  summary: Summary | null;
  log: LogEntry[];
  errorMsg: string | null;
  minId: string;
  maxId: string;
  retention: string;
  newIntake: string;
  resultsTab: ResultsTab;
  studentFilter: StudentFilter;
  runLabel: string;
  runStatusMsg: string | null;
  previewStatus: 'idle' | 'loading' | 'done' | 'error';
  preview: PreviewResponse | null;
  previewError: string | null;
  source: SourceId;
  files: File[];
  importStatus: 'idle' | 'working' | 'done' | 'error';
  importResult: ImportResult | null;
  importError: string | null;
};

let estimatorMemory: EstimatorMemory | null = null;

/**
 * The remembered state, with anything that was still in flight settled. Leaving the page closes the scrape's
 * EventSource, which cancels it on the server, and drops any pending fetch, so none of them can be resumed.
 * Restoring them as still running would leave a spinner that never finishes.
 */
function recallEstimator(): EstimatorMemory | null {
  if (!estimatorMemory) return null;
  const memory = { ...estimatorMemory };

  if (memory.runStatus === 'running') {
    memory.runStatus = 'idle';
    memory.errorMsg = 'Stopped when you left the page. Students fetched before then are still loaded.';
  }
  if (memory.previewStatus === 'loading') memory.previewStatus = memory.preview ? 'done' : 'idle';
  if (memory.importStatus === 'working') memory.importStatus = memory.importResult ? 'done' : 'idle';

  return memory;
}

export default function ClassEstimationPage() {
  // Read once per visit, so the initial values below are stable for the life of this mount.
  const [remembered] = useState(recallEstimator);

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [studentCount, setStudentCount] = useState(0);
  const [runStatus, setRunStatus] = useState<RunStatus>(remembered?.runStatus ?? 'idle');
  const [progress, setProgress] = useState<ProgressState | null>(remembered?.progress ?? null);
  const [summary, setSummary] = useState<Summary | null>(remembered?.summary ?? null);
  const [log, setLog] = useState<LogEntry[]>(remembered?.log ?? []);
  const [errorMsg, setErrorMsg] = useState<string | null>(remembered?.errorMsg ?? null);
  const [minId, setMinId] = useState(remembered?.minId ?? '');
  const [maxId, setMaxId] = useState(remembered?.maxId ?? '');

  // The target semester is not a choice. It is derived from today's date, since an estimate is always for the
  // next teaching semester, and the derivation lives in academicCalendar.ts so the server and page agree.
  const academicNow = describeAcademicNow();
  // The HoD's own figure for how many students come back next semester. There is no visa or graduation
  // status in the portal to derive it from, so it is an input rather than something inferred. Loaded from
  // and saved to SystemConfig, so a figure they worked out themselves is not retyped every session.
  const [retention, setRetention] = useState(remembered?.retention ?? '85');
  const [retentionSaved, setRetentionSaved] = useState(false);
  // Brand-new students the HoD expects. They are not in the portal, so there is nothing to derive it from.
  const [newIntake, setNewIntake] = useState(remembered?.newIntake ?? '0');
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [resultsTab, setResultsTab] = useState<ResultsTab>(remembered?.resultsTab ?? 'units');
  const [studentFilter, setStudentFilter] = useState<StudentFilter>(remembered?.studentFilter ?? 'all');
  // Step 1 folds once students are loaded; this opens it again. Not remembered: arriving back on the page
  // with students loaded should show the result, not the loading controls.
  const [loadOpen, setLoadOpen] = useState(false);
  // The run log shows only problems unless asked, since 500 lines of successes bury the few that matter.
  const [logScope, setLogScope] = useState<'problems' | 'all'>('problems');
  const [runLabel, setRunLabel] = useState(remembered?.runLabel ?? '');
  const [runStatusMsg, setRunStatusMsg] = useState<string | null>(remembered?.runStatusMsg ?? null);
  const [savingRun, setSavingRun] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    remembered?.previewStatus ?? 'idle',
  );
  const [preview, setPreview] = useState<PreviewResponse | null>(remembered?.preview ?? null);
  const [previewError, setPreviewError] = useState<string | null>(remembered?.previewError ?? null);
  const [copied, setCopied] = useState(false);

  const [source, setSource] = useState<SourceId>(remembered?.source ?? 'portal');
  const [mockAvailable, setMockAvailable] = useState(false);
  const [files, setFiles] = useState<File[]>(remembered?.files ?? []);
  const [dragging, setDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'working' | 'done' | 'error'>(
    remembered?.importStatus ?? 'idle',
  );
  const [importResult, setImportResult] = useState<ImportResult | null>(remembered?.importResult ?? null);
  const [importError, setImportError] = useState<string | null>(remembered?.importError ?? null);
  const [stored, setStored] = useState<{ storedStudents: number; bySource: Record<string, number> } | null>(null);

  // Kept current after every render rather than on unmount. An unmount handler would need every value in its
  // dependency list to see the latest ones, and missing one would restore a stale screen without complaint.
  useEffect(() => {
    estimatorMemory = {
      runStatus, progress, summary, log, errorMsg, minId, maxId, retention, newIntake,
      resultsTab, studentFilter, runLabel, runStatusMsg, previewStatus, preview, previewError,
      source, files, importStatus, importResult, importError,
    };
  });

  const esRef = useRef<EventSource | null>(null);
  const logWrapRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Start at the top on arrival rather than wherever the previous page was scrolled to. See scrollToTop.ts.
  useScrollToTopOnMount(rootRef);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Poll session status every 3s
  useEffect(() => {
    const poll = async () => {
      const res = await fetch('/api/scraper/status').catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      setSessionStatus(data.sessionStatus ?? 'idle');
      setStudentCount(data.studentCount ?? 0);
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // Which sources this build offers. Mock is hidden in a production build, so the picker has to ask rather
  // than assume it is available.
  useEffect(() => {
    fetch('/api/class-estimation/run', { method: 'OPTIONS' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.sources) return;
        setMockAvailable(data.sources.some((s: { id: string }) => s.id === 'mock'));
        // Only a first visit takes the environment's default; a returning one keeps the source it was on.
        if (data.default === 'mock' && !remembered) setSource('mock');
      })
      .catch(() => { /* leave the picker on portal only */ });
  }, []);

  useEffect(() => {
    // Coming back to the page, the fields already hold what was last typed, which may be newer than what
    // was saved: saving only happens on a run. Loading the saved figures over them would undo that typing.
    if (remembered) return;

    fetch(`/api/config?key=${RETENTION_KEY}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // parseStoredRetentionRate rejects the unset case, where the route returns null and Number(null)
        // would be 0, which is how this field once got silently set to zero retention. See retention.ts.
        const stored = parseStoredRetentionRate(data?.value);
        if (stored !== null) setRetention(retentionRateToPercent(stored));
      })
      .catch(() => { /* never set, so the built-in default stands */ });

    fetch(`/api/config?key=${NEW_INTAKE_KEY}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.value !== 'string' || data.value.trim() === '') return;
        const stored = Number(data.value);
        if (Number.isInteger(stored) && stored >= 0) setNewIntake(String(stored));
      })
      .catch(() => { /* never set, so zero stands */ });
  }, []);

  const refreshRuns = useCallback(() => {
    fetch('/api/class-estimation/runs')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data?.runs)) setRuns(data.runs); })
      .catch(() => { /* the history panel just stays empty */ });
  }, []);

  useEffect(() => { refreshRuns(); }, [refreshRuns]);

  /**
   * The server re-runs the estimate and saves that, rather than storing whatever is on screen. A saved run
   * has to be a record of what the system predicted, not of what a browser happened to be showing.
   */
  const saveRun = async () => {
    setSavingRun(true);
    setRunStatusMsg(null);
    try {
      const res = await fetch('/api/class-estimation/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: runLabel.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);

      setRunStatusMsg(`Saved, ${data.units} unit(s) recorded.`);
      setRunLabel('');
      refreshRuns();
    } catch (err) {
      setRunStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRun(false);
    }
  };

  const deleteRun = async (id: string) => {
    const res = await fetch(`/api/class-estimation/runs/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) { setRunStatusMsg('Could not delete that run.'); return; }
    refreshRuns();
  };

  const refreshStored = useCallback(() => {
    fetch('/api/class-estimation/import')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStored(data))
      .catch(() => { /* not fatal, the badge just stays hidden */ });
  }, []);

  useEffect(() => { refreshStored(); }, [refreshStored]);

  // Keep the newest log line in view by scrolling the log box itself. scrollIntoView was used here before, and
  // it scrolls every scrollable ancestor too, so with the log now restored on return to this page it dragged
  // the whole page down to the log on arrival, and during a scrape it made the page jump with every student.
  useEffect(() => {
    const box = logWrapRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log]);

  // Close EventSource on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  const appendLog = (type: LogEntry['type'], text: string) => {
    setLog((prev) => {
      const entry: LogEntry = { key: _logKey++, type, text };
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });
  };

  const cancelEstimation = () => {
    esRef.current?.close();
    esRef.current = null;
    setRunStatus('idle');
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const accepted = Array.from(incoming).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    const rejected = Array.from(incoming).length - accepted.length;

    setImportError(rejected > 0 ? `Ignored ${rejected} file(s) that are not .xlsx, .xls or .csv.` : null);
    setImportResult(null);
    setImportStatus('idle');
    // Replace rather than append, so what is listed is exactly what will be sent.
    setFiles(accepted);
  };

  /**
   * preview parses and reports without storing, so a batch can be checked before it replaces whatever the
   * previous run left in the store.
   */
  const runImport = async (preview: boolean) => {
    if (files.length === 0) return;
    setImportStatus('working');
    setImportError(null);

    try {
      const body = new FormData();
      for (const file of files) body.append('files', file);
      if (preview) body.append('preview', '1');

      const res = await fetch('/api/class-estimation/import', { method: 'POST', body });
      const data = await res.json().catch(() => null);

      if (!data) {
        setImportStatus('error');
        setImportError('The import endpoint returned nothing readable.');
        return;
      }
      if (data.error) {
        setImportStatus('error');
        setImportError(data.error);
        return;
      }

      setImportResult(data as ImportResult);
      setImportStatus(data.totalStudents > 0 ? 'done' : 'error');
      if (!preview) {
        refreshStored();
        // A fresh cohort invalidates whatever the last preview showed.
        setPreview(null);
        setPreviewStatus('idle');
      }
    } catch (err) {
      setImportStatus('error');
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEstimation = useCallback(() => {
    esRef.current?.close();

    _logKey = 0;
    setRunStatus('running');
    setProgress(null);
    setSummary(null);
    setLog([]);
    setErrorMsg(null);

    const params = new URLSearchParams();
    if (minId.trim()) params.set('minId', minId.trim());
    if (maxId.trim()) params.set('maxId', maxId.trim());
    // Only portal and mock run a scrape. Imported records are already in the store.
    if (source === 'mock') params.set('source', 'mock');
    const qs = params.toString();
    const es = new EventSource(`/api/class-estimation/run${qs ? `?${qs}` : ''}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        switch (data.type) {
          case 'start':
            setProgress({ current: 0, total: data.total as number, studentName: '', phase: '' });
            break;

          case 'progress':
            setProgress({
              current:     data.current     as number,
              total:       data.total       as number,
              studentName: data.studentName as string,
              phase:       data.phase       as string,
            });
            break;

          case 'student-done':
            appendLog('done', `${data.studentName as string} (${data.studentId as string})${data.course ? ` — ${data.course as string}` : ''}`);
            break;

          case 'student-skip':
            appendLog('skip', `${data.studentName as string} — ${data.reason as string}`);
            break;

          case 'student-error':
            appendLog('error', `${data.studentName as string} — ${data.error as string}`);
            break;

          case 'complete':
            setSummary({
              completed: data.completed as number,
              failed:    data.failed    as number,
              skipped:   data.skipped   as number,
              total:     data.total     as number,
            });
            setRunStatus('done');
            refreshStored();
            es.close();
            esRef.current = null;
            break;
        }
      } catch { /* ignore malformed event */ }
    };

    es.onerror = () => {
      // If we cancelled intentionally, runStatus is already 'idle' — don't overwrite.
      setRunStatus((prev) => (prev === 'running' ? 'error' : prev));
      setErrorMsg((prev) => prev ?? 'Connection to server lost. The estimation may have been interrupted.');
      es.close();
      esRef.current = null;
    };
  }, [minId, maxId, source, refreshStored]);

  const runPreview = async () => {
    setPreviewStatus('loading');
    setPreviewError(null);
    setCopied(false);
    try {
      // No term is sent: the route derives it from the date. ?term= exists only as a manual override.
      //
      // An empty box is not 0%, so this refuses to run rather than quietly estimating at zero retention
      // and then saving it as the HoD's figure.
      const rate = parseTypedRetentionPercent(retention);
      if (rate === null) {
        setPreviewStatus('error');
        setPreviewError('Enter the percentage of students expected back, from 1 to 100.');
        return;
      }

      // Running with a rate is as good a statement of intent as any, so it is saved then rather than on
      // every keystroke. A failure here is not worth interrupting the estimate for.
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: RETENTION_KEY, value: String(rate) }),
      })
        .then((res) => setRetentionSaved(res.ok))
        .catch(() => setRetentionSaved(false));

      const intake = Number(newIntake);
      if (!Number.isInteger(intake) || intake < 0) {
        setPreviewStatus('error');
        setPreviewError('New students must be a whole number, 0 or more.');
        return;
      }

      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: NEW_INTAKE_KEY, value: String(intake) }),
      }).catch(() => { /* not worth interrupting the estimate for */ });

      const res = await fetch(`/api/class-estimation/preview?retentionRate=${rate}&newIntake=${intake}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setPreview(data as PreviewResponse);
      setPreviewStatus('done');
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
      setPreviewStatus('error');
    }
  };

  const copyPreview = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
      setCopied(true);
    } catch {
      setPreviewError('Could not copy to the clipboard');
    }
  };

  const isLoggedIn = sessionStatus === 'logged-in';
  const isRunning  = runStatus === 'running';

  // Mock is only listed when the build actually offers it, so a production panel can never be pointed at
  // generated students. Only the portal option needs a login, which is the whole reason the other two exist.
  const sourceOptions: SourceOption[] = [
    {
      id: 'portal', label: 'Portal', requiresLogin: true,
      hint: 'Reads live transcripts from the student portal. Needs a portal login.',
    },
    ...(mockAvailable
      ? [{
          id: 'mock' as const, label: 'Mock Portal', requiresLogin: false,
          hint: 'Generated students built from the planners in this system. No login needed.',
        }]
      : []),
    {
      id: 'import', label: 'Imported DPA', requiresLogin: false,
      hint: 'Reads DPA files exported from the portal, a folder at a time.',
    },
  ];

  const canStartScrape = !isRunning && (source !== 'portal' || isLoggedIn);
  const pct = (progress && progress.total > 0)
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const logEntryClass: Record<LogEntry['type'], string> = {
    done:  styles.logEntryDone,
    error: styles.logEntryError,
    skip:  styles.logEntrySkip,
  };

  const logIcon: Record<LogEntry['type'], string> = {
    done:  '✓',
    error: '✗',
    skip:  '—',
  };

  const progressCardTitle =
    isRunning          ? 'Fetching transcripts' :
    runStatus === 'done' ? 'Finished' : 'Stopped';

  // ── Step 1 folds to a single line once students are loaded, unless a run is in progress or it was opened.
  const loadedCount = Number(stored?.storedStudents) || 0;
  const loadFolded = loadedCount > 0 && !isRunning && !loadOpen;
  // Guarded: a response without bySource, from an older server or an error body, must not take the page down.
  const loadedFrom = Object.entries(stored?.bySource ?? {})
    .map(([k, n]) => `${SOURCE_NAMES[k] ?? k} (${Number(n).toLocaleString()})`)
    .join(', ');

  const problems = log.filter((entry) => entry.type !== 'done');
  const shownLog = logScope === 'all' ? log : problems;

  // ── Figures for step 2. Pipeline counts live on the Checks tab; these are what a reader actually wants.
  const s = preview?.summary;
  const estimatedCount = s ? s.students - s.noMajorOrPlanner - s.errors : 0;
  const needsLook = s ? s.noMajorOrPlanner + s.errors : 0;
  const unitsRunning = s ? s.totals.units - s.totals.unitsWithNoStudents : 0;

  const studentRows = (preview?.students ?? []).filter((student) => {
    if (studentFilter === 'all') return true;
    if (studentFilter === 'major') return student.basis === 'major' && !student.error;
    if (studentFilter === 'commonCore') return student.basis === 'commonCore' && !student.error;
    if (studentFilter === 'error') return Boolean(student.error);
    return !student.error && !student.basis;   // not estimated
  });

  const filterCounts = preview ? {
    all: preview.students.length,
    major: preview.students.filter((x) => x.basis === 'major' && !x.error).length,
    commonCore: preview.students.filter((x) => x.basis === 'commonCore' && !x.error).length,
    notEstimated: preview.students.filter((x) => !x.error && !x.basis).length,
    error: preview.students.filter((x) => Boolean(x.error)).length,
  } : null;

  return (
    <div className={styles.panel} ref={rootRef}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Class Estimation</h1>
          <p className={styles.subtitle}>
            How many students to expect in each unit next semester, worked out from current students&apos;
            transcripts. Three steps: load the students, run the estimate, save it.
          </p>
        </div>
        {/* The read-only view of a saved run, without the controls or the per-student detail. */}
        <Link href="/class-estimation/report" className={styles.reportLink}>
          Head of Department view →
        </Link>
      </div>

      {/* ── Step 1: load students ────────────────────────────────────────────── */}
      <Step
        number={1}
        title="Load current students"
        explainer="Choose where transcripts come from. Each student's record is read once and kept in memory only, never saved."
        done={loadedCount > 0 && !isRunning}
        folded={loadFolded}
        summary={
          <>
            <strong>{loadedCount.toLocaleString()} students loaded</strong>
            {loadedFrom && ` from ${loadedFrom}`}
            {summary && ` · last fetch: ${summary.completed.toLocaleString()} read`}
            {summary && summary.skipped > 0 && `, ${summary.skipped} skipped`}
            {summary && summary.failed > 0 && `, ${summary.failed} failed`}
          </>
        }
        onToggle={loadedCount > 0 && !isRunning ? () => setLoadOpen(!loadOpen) : undefined}
        toggleLabel={loadFolded ? 'Load again' : 'Hide'}
      >
        <div className={styles.sourceRow}>
          {sourceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.sourceOption} ${source === option.id ? styles.sourceOptionActive : ''}`}
              onClick={() => setSource(option.id)}
              disabled={isRunning || importStatus === 'working'}
            >
              <span>{option.label}</span>
              <span className={styles.sourceOptionHint}>{option.hint}</span>
            </button>
          ))}
        </div>

        {/* Imported DPA files */}
        {source === 'import' && (
          <div className={styles.subPanel}>
            <div
              className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            >
              {files.length === 0
                ? 'Drag DPA files here, or click to choose. One file per student, or one sheet holding many.'
                : `${files.length} file(s) ready. Drop more to replace this selection.`}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {/* A file list long enough to matter is paged like everything else on the page. */}
            {importResult ? (
              <DataTable
                rows={importResult.files}
                rowKey={(file) => file.filename}
                searchText={(file) => file.filename}
                searchPlaceholder="Find a file"
                pageSize={8}
                columns={[
                  { key: 'ok', label: '', width: '24px', render: (file) => (file.ok ? <span className={styles.ok}>✓</span> : <span className={styles.bad}>✗</span>) },
                  { key: 'name', label: 'File', width: 'minmax(140px, 1fr)', render: (file) => file.filename, sortValue: (file) => file.filename },
                  {
                    key: 'result', label: 'Result', width: 'minmax(160px, 1.4fr)',
                    render: (file) => (file.ok
                      ? `${file.students.length} student(s)${file.rowWarnings.length ? ` · ${file.rowWarnings.length} row warning(s)` : ''}`
                      : file.error),
                  },
                ]}
              />
            ) : files.length > 0 && (
              <p className={styles.hintText}>{files.map((file) => file.name).slice(0, 6).join(', ')}{files.length > 6 ? ` and ${files.length - 6} more` : ''}</p>
            )}

            {importResult && (
              <p className={styles.hintText}>
                {importResult.preview
                  ? `Checked, nothing loaded yet: ${importResult.totalStudents} student(s) in ${importResult.totalFiles} file(s).`
                  : `Loaded ${importResult.storedStudents} student(s), replacing any earlier batch.`}
                {importResult.filesFailed > 0 && ` ${importResult.filesFailed} file(s) could not be read.`}
              </p>
            )}
            {importError && <div className={styles.errorBox}>{importError}</div>}

            <div className={styles.actionRow}>
              <button className={styles.btnSecondary} disabled={files.length === 0 || importStatus === 'working'} onClick={() => runImport(true)}>
                {importStatus === 'working' ? 'Reading…' : 'Check files'}
              </button>
              <button className={styles.btnPrimary} disabled={files.length === 0 || importStatus === 'working'} onClick={() => runImport(false)}>
                Load {files.length > 0 ? `${files.length} file(s)` : 'files'}
              </button>
              {files.length > 0 && (
                <button
                  className={styles.btnSecondary}
                  disabled={importStatus === 'working'}
                  onClick={() => { setFiles([]); setImportResult(null); setImportError(null); setImportStatus('idle'); }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Portal or generated students */}
        {source !== 'import' && (
          <div className={styles.subPanel}>
            {source === 'mock' ? (
              <div className={styles.statusRow}>
                <span className={styles.statusDot} style={{ background: 'var(--accent-green)' }} />
                <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                  Ready · generated test students built from the planners in this system, no login needed
                </span>
              </div>
            ) : (
              <div className={styles.statusRow}>
                <span className={styles.statusDot} style={{ background: isLoggedIn ? 'var(--accent-green)' : 'var(--text-muted)' }} />
                <span style={{ fontSize: 12, color: isLoggedIn ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {isLoggedIn
                    ? `Connected · ${studentCount.toLocaleString()} students available`
                    : 'Not connected. Log in to the portal with the button in the top bar first.'}
                </span>
              </div>
            )}

            <div className={styles.rangeRow}>
              <div className={styles.rangeField}>
                <label className={styles.rangeLabel}>From student ID</label>
                <input className={styles.rangeInput} type="number" placeholder="e.g. 102780000" value={minId} onChange={(e) => setMinId(e.target.value)} disabled={isRunning} />
              </div>
              <div className={styles.rangeField}>
                <label className={styles.rangeLabel}>To student ID</label>
                <input className={styles.rangeInput} type="number" placeholder="e.g. 102800000" value={maxId} onChange={(e) => setMaxId(e.target.value)} disabled={isRunning} />
              </div>
            </div>
            <p className={styles.hintText}>Leave both empty to read every student.</p>

            <div className={styles.actionRow}>
              <button className={styles.btnPrimary} disabled={!canStartScrape} onClick={startEstimation}>
                {runStatus === 'done' ? 'Read again' : 'Read transcripts'}
              </button>
              {isRunning && <button className={styles.btnDanger} onClick={cancelEstimation}>Cancel</button>}
            </div>
          </div>
        )}

        {/* Progress, only while there is something to show */}
        {progress && (
          <div className={styles.subPanel}>
            <div className={styles.progressHead}>
              <span>{progressCardTitle}</span>
              <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()} · {pct}%</span>
            </div>
            <div className={styles.progressWrap}>
              <div
                className={`${styles.progressFill} ${isRunning ? styles.progressAnimated : ''}`}
                style={{ width: `${pct}%`, background: runStatus === 'done' ? 'var(--accent-green)' : 'var(--accent-blue)' }}
              />
            </div>
            {isRunning && progress.studentName && (
              <div className={styles.currentStatus}>
                <span className={styles.spinner} />
                <span className={styles.phaseLabel}>{PHASE_LABEL[progress.phase] ?? progress.phase}</span>
                <span className={styles.studentName}>{progress.studentName}</span>
              </div>
            )}
            {summary && (
              <p className={styles.hintText}>
                {summary.completed.toLocaleString()} read · {summary.skipped.toLocaleString()} skipped · {summary.failed.toLocaleString()} failed
              </p>
            )}
            {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}

            {/* The log is a diagnostic, so it is closed by default and shows only the problems. */}
            {log.length > 0 && (
              <details className={styles.logDetails}>
                <summary>
                  Run log · {problems.length === 0 ? 'no problems' : `${problems.length} problem(s)`}
                </summary>
                <div className={styles.logScope}>
                  <button type="button" className={logScope === 'problems' ? styles.scopeActive : ''} onClick={() => setLogScope('problems')}>
                    Problems ({problems.length})
                  </button>
                  <button type="button" className={logScope === 'all' ? styles.scopeActive : ''} onClick={() => setLogScope('all')}>
                    Everything ({log.length})
                  </button>
                </div>
                <div className={styles.logWrap} ref={logWrapRef}>
                  {shownLog.length === 0 && <div className={styles.logEntry}>Nothing went wrong.</div>}
                  {shownLog.map((entry) => (
                    <div key={entry.key} className={`${styles.logEntry} ${logEntryClass[entry.type]}`}>
                      <span className={styles.logIcon}>{logIcon[entry.type]}</span>
                      {entry.text}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Step>

      {/* ── Step 2: estimate ─────────────────────────────────────────────────── */}
      <Step
        number={2}
        title="Estimate next semester"
        explainer="Works out which units each loaded student still needs, which of those they can take next semester, and adds them up per unit."
        done={Boolean(preview)}
      >
        <div className={styles.targetRow}>
          <span className={styles.targetLabel}>Estimating for</span>
          <span className={styles.targetValue}>{preview?.target?.label ?? academicNow.label}</span>
          <span className={styles.targetReason}>{preview?.target?.reason ?? academicNow.reason}</span>
        </div>

        <div className={styles.actionRow}>
          <div className={styles.rangeField}>
            <label className={styles.rangeLabel} title="The share of current students you expect to come back. Visa refusals, withdrawals and deferrals all reduce it.">
              Students returning (%){retentionSaved ? ' · saved' : ''}
            </label>
            <input className={styles.rangeInput} type="number" min={1} max={100} value={retention}
              onChange={(e) => setRetention(e.target.value)} disabled={previewStatus === 'loading' || isRunning} />
          </div>
          <div className={styles.rangeField}>
            <label className={styles.rangeLabel} title="Students starting the course next semester. They are not in the portal yet, so the number is entered here and added in full to the Year 1, Semester 1 units of the Computer Science planners. Credit-transfer students are placed by hand.">
              New first-year students
            </label>
            <input className={styles.rangeInput} type="number" min={0} value={newIntake}
              onChange={(e) => setNewIntake(e.target.value)} disabled={previewStatus === 'loading' || isRunning} />
          </div>
          <button className={styles.btnPrimary} disabled={previewStatus === 'loading' || isRunning || loadedCount === 0} onClick={runPreview}>
            {previewStatus === 'loading' ? 'Estimating…' : preview ? 'Estimate again' : 'Run estimate'}
          </button>
        </div>
        {loadedCount === 0 && !preview && <p className={styles.hintText}>Load students in step 1 first.</p>}
        {previewError && <div className={styles.errorBox} style={{ marginTop: 12 }}>{previewError}</div>}

        {preview && s && (
          <>
            <div className={ui.figures}>
              <Figure value={estimatedCount.toLocaleString()} label="Students estimated"
                note={`${s.withPlanner.toLocaleString()} by their major · ${s.commonCoreOnly.toLocaleString()} first-years by shared units`} />
              <Figure value={s.totals.headcount.toLocaleString()} label="Enrolments expected"
                note={`${(s.retentionRate * 100).toFixed(0)}% returning${s.newIntakeCount > 0 ? ` + ${s.newIntakeCount} new` : ''}`} tone="good" />
              <Figure value={unitsRunning.toLocaleString()} label="Units running"
                note={s.totals.unitsWithNoStudents > 0 ? `${s.totals.unitsWithNoStudents} more expected to draw nobody` : 'every unit draws students'} />
              <Figure value={needsLook.toLocaleString()} label="Need a look"
                note={needsLook > 0 ? 'see the Students tab' : 'every student was estimated'} tone={needsLook > 0 ? 'warn' : undefined} />
            </div>

            <Tabs<ResultsTab>
              active={resultsTab}
              onChange={setResultsTab}
              tabs={[
                { id: 'units', label: 'Enrolment by unit', count: s.projectedByUnit.length },
                { id: 'electives', label: 'Electives', count: s.electiveSeatsByUnit.length },
                { id: 'students', label: 'Students', count: preview.students.length },
                { id: 'checks', label: 'Checks' },
              ]}
            />

            {resultsTab === 'units' && (
              <>
                <p className={styles.tabIntro}>
                  The estimate, one row per unit. <strong>Required</strong> is students whose planner says they still
                  owe the unit. <strong>Elective</strong> is shares of students spread over the options they could pick,
                  so it is fractional. <strong>New</strong> is the new-student figure. <strong>Headcount</strong> is all
                  three after the returning rate, rounded once at the end. Click a heading to sort.
                </p>
                <DataTable
                  rows={s.projectedByUnit}
                  rowKey={(unit) => unit.code}
                  searchText={(unit) => `${unit.code} ${s.unitNames?.[unit.code] ?? ''}`}
                  searchPlaceholder="Find a unit by code or name"
                  initialSort={{ key: 'headcount', direction: 'desc' }}
                  columns={[
                    { key: 'code', label: 'Unit', width: 'minmax(220px, 2.2fr)', render: (unit) => <UnitName code={unit.code} names={s.unitNames} />, sortValue: (unit) => unit.code },
                    { key: 'named', label: 'Required', hint: 'Students whose planner says they still owe this unit', width: '90px', align: 'right', render: (unit) => unit.fromNamedPicks || '–', sortValue: (unit) => unit.fromNamedPicks },
                    { key: 'elective', label: 'Elective', hint: 'Shares of students who could choose this as an elective', width: '90px', align: 'right', render: (unit) => (unit.fromElectives > 0 ? unit.fromElectives.toFixed(1) : '–'), sortValue: (unit) => unit.fromElectives },
                    { key: 'new', label: 'New', hint: 'New first-year students, entered by hand', width: '70px', align: 'right', render: (unit) => unit.fromNewIntake || '–', sortValue: (unit) => unit.fromNewIntake },
                    {
                      key: 'headcount', label: 'Headcount', width: '150px', align: 'right', sortValue: (unit) => unit.projected,
                      render: (unit) => (unit.headcount === 0
                        ? <span className={styles.muted}>0 · not expected to run</span>
                        : <strong className={styles.headcount}>{unit.headcount.toLocaleString()}</strong>),
                    },
                  ]}
                />
                {(s.newIntakeCount > 0 || s.newIntake.warnings.length > 0) && (
                  <div className={styles.previewNotes}>
                    {s.newIntakeCount > 0 && (
                      <div>
                        {s.newIntakeCount} new first-year students added to the Year 1, Semester 1 units:{' '}
                        {s.newIntake.units.map((code) => (s.unitNames?.[code] ? `${code} ${s.unitNames[code]}` : code)).join(', ') || 'none found'}.
                      </div>
                    )}
                    {s.newIntake.warnings.map((warning) => <div key={warning}>⚠ {warning}</div>)}
                  </div>
                )}
              </>
            )}

            {resultsTab === 'electives' && (
              <>
                <p className={styles.tabIntro}>
                  Nobody can say which elective a particular student will pick, so each student&apos;s elective places are
                  shared across every option open to them, weighted by how many current students have already taken it.
                  Single units are rough; the total across a group of electives is the reliable part.
                </p>
                <DataTable
                  rows={s.electiveSeatsByUnit}
                  rowKey={(unit) => unit.code}
                  searchText={(unit) => `${unit.code} ${s.unitNames?.[unit.code] ?? ''}`}
                  searchPlaceholder="Find an elective"
                  initialSort={{ key: 'expected', direction: 'desc' }}
                  columns={[
                    { key: 'code', label: 'Unit', width: 'minmax(220px, 2.2fr)', render: (unit) => <UnitName code={unit.code} names={s.unitNames} />, sortValue: (unit) => unit.code },
                    { key: 'type', label: 'Type', width: '110px', render: (unit) => ELECTIVE_TYPE[unit.category] ?? unit.category, sortValue: (unit) => unit.category },
                    { key: 'popularity', label: 'Taken by', hint: 'Current students who have already passed this unit, which is what the shares are weighted by', width: '90px', align: 'right', render: (unit) => unit.popularity, sortValue: (unit) => unit.popularity },
                    { key: 'expected', label: 'Expected', width: '90px', align: 'right', render: (unit) => <strong className={styles.headcount}>{unit.expectedSeats.toFixed(1)}</strong>, sortValue: (unit) => unit.expectedSeats },
                  ]}
                  empty="No student has elective places to fill next semester."
                />
                {s.electiveSeatsUnplaced > 0 && (
                  <p className={styles.hintText}>
                    {s.electiveSeatsUnplaced.toFixed(1)} elective place(s) could not be placed: those students owe an elective but
                    none of their options is running next semester or open to them yet.
                  </p>
                )}
              </>
            )}

            {resultsTab === 'students' && filterCounts && (
              <>
                <p className={styles.tabIntro}>
                  Every loaded student and what was predicted for them. Click a student to see why.
                </p>
                <DataTable
                  rows={studentRows}
                  rowKey={(student) => student.studentId}
                  searchText={(student) => `${student.studentId} ${student.name} ${student.planner?.majorName ?? ''}`}
                  searchPlaceholder="Find a student or major"
                  toolbar={
                    <div className={styles.filterChips}>
                      {([
                        ['all', 'All', filterCounts.all],
                        ['major', 'By major', filterCounts.major],
                        ['commonCore', 'First-years (shared units)', filterCounts.commonCore],
                        ['notEstimated', 'Not estimated', filterCounts.notEstimated],
                        ['error', 'Errors', filterCounts.error],
                      ] as const).filter(([id, , n]) => id === 'all' || n > 0).map(([id, label, n]) => (
                        <button key={id} type="button" className={studentFilter === id ? styles.chipActive : styles.chip} onClick={() => setStudentFilter(id)}>
                          {label} <span>{n.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  }
                  columns={[
                    { key: 'student', label: 'Student', width: 'minmax(150px, 1.3fr)', render: (st) => studentLabel(st), sortValue: (st) => st.studentId },
                    { key: 'basis', label: 'Estimated from', width: 'minmax(150px, 1.2fr)', render: (st) => describeBasis(st), sortValue: (st) => st.planner?.majorName ?? st.basis ?? '' },
                    { key: 'picked', label: 'Predicted units', width: 'minmax(180px, 1.6fr)', render: (st) => (st.picked.length ? st.picked.map((u) => u.code).join(', ') : <span className={styles.muted}>none</span>), sortValue: (st) => st.picked.length },
                    { key: 'electives', label: 'Elective options', width: '120px', align: 'right', render: (st) => (st.electives.length || <span className={styles.muted}>–</span>), sortValue: (st) => st.electives.length },
                  ]}
                  renderExpanded={(st) => <StudentDetail student={st} loadCap={DEFAULT_LOAD_CAP} />}
                  empty="No student in this group."
                />
              </>
            )}

            {resultsTab === 'checks' && (
              <div className={styles.checks}>
                <p className={styles.tabIntro}>
                  How the estimate was narrowed down, and anything worth checking before trusting it.
                </p>

                <div className={styles.funnel}>
                  <div><strong>{s.totalCandidates.toLocaleString()}</strong><span>units still owed</span><em>across every student&apos;s planner</em></div>
                  <span className={styles.funnelArrow}>→</span>
                  <div><strong>{s.totalEligible.toLocaleString()}</strong><span>can be taken next semester</span><em>running then, prerequisites met</em></div>
                  <span className={styles.funnelArrow}>→</span>
                  <div><strong>{s.totalPicked.toLocaleString()}</strong><span>predicted</span><em>the earliest ones, up to a normal load</em></div>
                </div>

                <div className={styles.previewNotes}>
                  <div>
                    Ruled out: {s.ineligibleByReason['not-offered-in-term'].toLocaleString()} not running next semester ·{' '}
                    {s.ineligibleByReason['requisites-unmet'].toLocaleString()} prerequisites not met yet
                    {s.ineligibleByReason['not-in-planner'] > 0 && ` · ${s.ineligibleByReason['not-in-planner']} not in the student's planner`}
                  </div>
                  {s.eligibleWithoutOfferingData > 0 && (
                    <div>⚠ {s.eligibleWithoutOfferingData} predicted unit(s) have no offering data, so they were assumed to run every semester.</div>
                  )}
                  {s.outsideRecommendedTerm > 0 && (
                    <div>
                      {s.outsideRecommendedTerm.toLocaleString()} prediction(s) fall in a semester the student&apos;s planner does not
                      recommend. Normal for retakes; worth checking if a whole group appears there.
                    </div>
                  )}
                  {Object.entries(s.mappingWarningCounts).map(([warning, n]) => (
                    <div key={warning}>{n.toLocaleString()} × {warning}</div>
                  ))}
                </div>

                <h3 className={styles.checksHeading}>Majors detected</h3>
                <DataTable
                  rows={s.plannerCounts}
                  rowKey={(p) => p.plannerId}
                  searchText={(p) => p.majorName}
                  searchPlaceholder="Find a major"
                  pageSize={8}
                  initialSort={{ key: 'students', direction: 'desc' }}
                  columns={[
                    { key: 'major', label: 'Major', width: 'minmax(160px, 1fr)', render: (p) => p.majorName, sortValue: (p) => p.majorName },
                    { key: 'intake', label: 'Intake', width: '110px', render: (p) => `${p.intakeYear} S${p.intakeSemester}`, sortValue: (p) => p.intakeYear * 10 + p.intakeSemester },
                    { key: 'students', label: 'Students', width: '90px', align: 'right', render: (p) => p.students, sortValue: (p) => p.students },
                  ]}
                />

                <div className={styles.actionRow}>
                  <button className={styles.btnSecondary} onClick={copyPreview}>{copied ? 'Copied' : 'Copy raw data (JSON)'}</button>
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      {/* ── Step 3: save ─────────────────────────────────────────────────────── */}
      <Step
        number={3}
        title="Save the estimate"
        explainer="Saving records the per-unit figures and the settings behind them, never any student's details, so the Head of Department view and the Excel download can use it later."
        done={runs.length > 0}
      >
        <p className={styles.hintText}>
          Saving recalculates on the server from the students loaded now, so load the batch you want recorded first.
        </p>
        <div className={styles.actionRow}>
          <div className={styles.rangeField} style={{ flex: 1, minWidth: 180 }}>
            <label className={styles.rangeLabel}>Label (optional)</label>
            <input className={styles.rangeInput} type="text" placeholder="e.g. before the FTES change" value={runLabel}
              onChange={(e) => setRunLabel(e.target.value)} disabled={savingRun} />
          </div>
          <button className={styles.btnPrimary} disabled={savingRun || loadedCount === 0} onClick={saveRun}>
            {savingRun ? 'Saving…' : 'Save this estimate'}
          </button>
        </div>
        {runStatusMsg && <p className={styles.hintText}>{runStatusMsg}</p>}

        {runs.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={runs}
              rowKey={(run) => run.id}
              searchText={(run) => `${run.label ?? ''} ${new Date(run.createdAt).toLocaleString()} ${run.source}`}
              searchPlaceholder="Find a saved estimate"
              pageSize={5}
              columns={[
                { key: 'when', label: 'Saved', width: 'minmax(150px, 1.4fr)', render: (run) => <>{new Date(run.createdAt).toLocaleString()}{run.label ? <span className={styles.muted}> · {run.label}</span> : null}</>, sortValue: (run) => run.createdAt },
                { key: 'term', label: 'For', width: '80px', render: (run) => `S${run.targetSemester} ${run.targetYear}`, sortValue: (run) => run.targetYear * 10 + run.targetSemester },
                { key: 'students', label: 'Students', width: '90px', align: 'right', render: (run) => `${run.studentCount.toLocaleString()}${run.newIntake ? ` +${run.newIntake}` : ''}`, sortValue: (run) => run.studentCount },
                { key: 'returning', label: 'Returning', width: '90px', align: 'right', render: (run) => `${(run.retentionRate * 100).toFixed(0)}%`, sortValue: (run) => run.retentionRate },
                { key: 'total', label: 'Enrolments', width: '100px', align: 'right', render: (run) => run.totalHeadcount.toLocaleString(), sortValue: (run) => run.totalHeadcount },
                { key: 'source', label: 'Source', width: '80px', render: (run) => SOURCE_NAMES[run.source] ?? run.source, sortValue: (run) => run.source },
                {
                  key: 'actions', label: '', width: '70px', align: 'right',
                  render: (run) => (
                    <button type="button" className={styles.runDelete} onClick={(e) => { e.stopPropagation(); void deleteRun(run.id); }}>
                      Remove
                    </button>
                  ),
                },
              ]}
              renderExpanded={(run) => <SavedRunUnits id={run.id} />}
            />
          </div>
        )}
      </Step>
    </div>
  );
}

// ── Pieces used above ────────────────────────────────────────────────────────

/** A unit code with its name beside it, quieter, when the planners give one. */
function UnitName({ code, names }: { code: string; names?: Record<string, string> }) {
  const name = names?.[code];
  return (
    <span title={name ? `${code} ${name}` : code}>
      <span className={styles.mono}>{code}</span>
      {name && <span className={styles.unitName}> {name}</span>}
    </span>
  );
}

type StudentResult = EstimationPreview['students'][number];

/**
 * The student's ID, plus their name only when it says something the ID does not. Imported DPA files carry no
 * name, so the name falls back to the ID, and generated students are named after theirs; showing both
 * printed the same number twice.
 */
function studentLabel(student: StudentResult): ReactNode {
  const name = student.name?.trim() ?? '';
  const nameAddsSomething = name !== '' && !name.includes(student.studentId);
  return nameAddsSomething
    ? <>{student.studentId} <span className={styles.muted}>{name}</span></>
    : <>{student.studentId}{/^mock/i.test(name) && <span className={styles.muted}> · generated</span>}</>;
}

/** How a student was estimated, in a few words. */
function describeBasis(student: StudentResult): ReactNode {
  if (student.error) return <span className={styles.bad}>Error</span>;
  if (student.planner) return <>{student.planner.majorName} <span className={styles.muted}>{student.planner.matchPct.toFixed(0)}% match</span></>;
  if (student.basis === 'commonCore') return <span className={styles.muted}>First-year shared units</span>;
  return <span className={styles.warn}>Not estimated</span>;
}

const REASON_WORDS: Record<string, string> = {
  'not-offered-in-term': 'not running next semester',
  'requisites-unmet': 'prerequisites not met yet',
  'not-in-planner': 'not in their planner',
};

/** One student's estimate, explained in sentences rather than shown as data. */
function StudentDetail({ student, loadCap }: { student: StudentResult; loadCap: number }) {
  if (student.error) return <div className={styles.bad}>Could not be estimated: {student.error}</div>;

  return (
    <div className={styles.studentDetail}>
      <div>
        <strong>Estimated from: </strong>
        {student.planner
          ? `the ${student.planner.majorName} planner for the ${student.planner.intakeYear} semester ${student.planner.intakeSemester} intake, a ${student.planner.matchPct.toFixed(0)}% match with their transcript.`
          : student.basis === 'commonCore'
            ? 'the units every major shares. They are early enough in the course that their major cannot be told apart yet, so only units certain for any major are counted.'
            : `nothing. No planner fitted their transcript (${student.matchStatus ?? 'no match'}).`}
      </div>
      <div><strong>Has passed or is taking: </strong>{student.completedCount} unit(s).</div>
      <div>
        <strong>Predicted next semester: </strong>
        {student.picked.length ? student.picked.map((u) => u.code).join(', ') : 'nothing they are required to take.'}
        {student.droppedByLoadCap > 0 && ` ${student.droppedByLoadCap} more could be taken but were left for later, to keep to a ${loadCap}-unit load.`}
      </div>
      {student.electives.length > 0 && (
        <div>
          <strong>Elective options, shared: </strong>
          {student.electives.slice(0, 8).map((e) => `${e.code} (${e.expectedSeats.toFixed(2)})`).join(', ')}
          {student.electives.length > 8 && ` and ${student.electives.length - 8} more`}
        </div>
      )}
      {student.ineligible.length > 0 && (
        <div>
          <strong>Still owed but not predicted: </strong>
          {student.ineligible.slice(0, 8).map((u) => `${u.code}, ${REASON_WORDS[u.reason] ?? u.reason}`).join('; ')}
          {student.ineligible.length > 8 && `; and ${student.ineligible.length - 8} more`}
        </div>
      )}
      {student.mappingWarnings.length > 0 && (
        <div className={styles.muted}>Assumed: {student.mappingWarnings.join('; ')}</div>
      )}
      <details className={styles.rawToggle}>
        <summary>Raw data</summary>
        <pre className={styles.previewPre}>{JSON.stringify(student, null, 2)}</pre>
      </details>
    </div>
  );
}

/** A saved estimate's unit figures, fetched when its row is opened. */
function SavedRunUnits({ id }: { id: string }) {
  const [units, setUnits] = useState<SavedRunDetail['units'] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/class-estimation/runs/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: SavedRunDetail) => { if (live) setUnits(data.units); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);

  if (failed) return <div className={styles.bad}>This estimate could not be loaded.</div>;
  if (!units) return <div className={styles.muted}>Loading…</div>;

  return (
    <>
      <div className={styles.actionRow} style={{ marginTop: 0, marginBottom: 8 }}>
        <a className={styles.btnSecondary} href={`/api/class-estimation/runs/${id}/export`}>Download Excel</a>
      </div>
      <DataTable
        rows={units}
        rowKey={(unit) => unit.unitCode}
        searchText={(unit) => unit.unitCode}
        searchPlaceholder="Find a unit"
        pageSize={10}
        initialSort={{ key: 'headcount', direction: 'desc' }}
        columns={[
          { key: 'code', label: 'Unit', width: 'minmax(90px, 1fr)', render: (unit) => <span className={styles.mono}>{unit.unitCode}</span>, sortValue: (unit) => unit.unitCode },
          { key: 'named', label: 'Required', width: '90px', align: 'right', render: (unit) => unit.fromNamedPicks || '–', sortValue: (unit) => unit.fromNamedPicks },
          { key: 'elective', label: 'Elective', width: '90px', align: 'right', render: (unit) => (unit.fromElectives > 0 ? unit.fromElectives.toFixed(1) : '–'), sortValue: (unit) => unit.fromElectives },
          { key: 'new', label: 'New', width: '70px', align: 'right', render: (unit) => unit.fromNewIntake || '–', sortValue: (unit) => unit.fromNewIntake },
          { key: 'headcount', label: 'Headcount', width: '100px', align: 'right', render: (unit) => <strong className={styles.headcount}>{unit.headcount}</strong>, sortValue: (unit) => unit.projected },
        ]}
      />
    </>
  );
}
