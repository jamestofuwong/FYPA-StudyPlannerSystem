'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';
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

let _logKey = 0;

export default function ClassEstimationPage() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [studentCount, setStudentCount] = useState(0);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [minId, setMinId] = useState('');
  const [maxId, setMaxId] = useState('');

  // The target semester is not a choice. It is derived from today's date, since an estimate is always for the
  // next teaching semester, and the derivation lives in academicCalendar.ts so the server and page agree.
  const academicNow = describeAcademicNow();
  // The HoD's own figure for how many students come back next semester. There is no visa or graduation
  // status in the portal to derive it from, so it is an input rather than something inferred. Loaded from
  // and saved to SystemConfig, so a figure they worked out themselves is not retyped every session.
  const [retention, setRetention] = useState('85');
  const [retentionSaved, setRetentionSaved] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [source, setSource] = useState<SourceId>('portal');
  const [mockAvailable, setMockAvailable] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [stored, setStored] = useState<{ storedStudents: number; bySource: Record<string, number> } | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
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
        if (data.default === 'mock') setSource('mock');
      })
      .catch(() => { /* leave the picker on portal only */ });
  }, []);

  useEffect(() => {
    fetch(`/api/config?key=${RETENTION_KEY}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // parseStoredRetentionRate rejects the unset case, where the route returns null and Number(null)
        // would be 0, which is how this field once got silently set to zero retention. See retention.ts.
        const stored = parseStoredRetentionRate(data?.value);
        if (stored !== null) setRetention(retentionRateToPercent(stored));
      })
      .catch(() => { /* never set, so the built-in default stands */ });
  }, []);

  const refreshStored = useCallback(() => {
    fetch('/api/class-estimation/import')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStored(data))
      .catch(() => { /* not fatal, the badge just stays hidden */ });
  }, []);

  useEffect(() => { refreshStored(); }, [refreshStored]);

  // Auto-scroll log to bottom as new entries arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

      const res = await fetch(`/api/class-estimation/preview?retentionRate=${rate}`);
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
    isRunning          ? 'Fetching Degree Audits' :
    runStatus === 'done' ? 'Completed' : 'Stopped';

  return (
    <div className={styles.panel}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h1 className={styles.title}>Class Estimation</h1>
        <p className={styles.subtitle}>
          Estimate next-semester enrollment headcount for each unit
        </p>
      </div>

      {/* ── Where transcripts come from ──────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Student Data Source</div>

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

        {stored && stored.storedStudents > 0 && (
          <div className={styles.storedBadge}>
            <span className={styles.statusDot} style={{ background: 'var(--accent-green)' }} />
            {stored.storedStudents.toLocaleString()} student(s) loaded
            {Object.keys(stored.bySource).length > 0 && ` · from ${Object.entries(stored.bySource).map(([k, n]) => `${k} (${n})`).join(', ')}`}
          </div>
        )}
      </div>

      {/* ── Imported files ───────────────────────────────────────────────────── */}
      {source === 'import' && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Import Student DPA Files</div>

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

          {files.length > 0 && !importResult && (
            <div className={styles.fileList}>
              {files.map((file) => (
                <div key={file.name} className={styles.fileRow}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileNote}>{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-file outcome, so one unreadable file is visible rather than lost in a total. */}
          {importResult && (
            <div className={styles.fileList}>
              {importResult.files.map((file) => (
                <div
                  key={file.filename}
                  className={`${styles.fileRow} ${file.ok ? styles.fileRowOk : styles.fileRowFail}`}
                >
                  <span>{file.ok ? '✓' : '✗'}</span>
                  <span className={styles.fileName}>{file.filename}</span>
                  <span className={styles.fileNote}>
                    {file.ok
                      ? `${file.students.length} student(s)${file.rowWarnings.length > 0 ? ` · ${file.rowWarnings.length} row warning(s)` : ''}`
                      : file.error}
                  </span>
                </div>
              ))}
            </div>
          )}

          {importResult && (
            <p className={styles.hintText} style={{ marginTop: 8 }}>
              {importResult.preview
                ? `Preview only, nothing stored yet: ${importResult.totalStudents} student(s) across ${importResult.totalFiles} file(s)`
                : `Stored ${importResult.storedStudents} student(s), replacing any previous batch`}
              {importResult.filesFailed > 0 && ` · ${importResult.filesFailed} file(s) failed`}
            </p>
          )}

          {importError && <div className={styles.errorBox}>{importError}</div>}

          <div className={styles.actionRow}>
            <button
              className={styles.btnSecondary}
              disabled={files.length === 0 || importStatus === 'working'}
              onClick={() => runImport(true)}
            >
              {importStatus === 'working' ? 'Reading…' : 'Preview'}
            </button>
            <button
              className={styles.btnPrimary}
              disabled={files.length === 0 || importStatus === 'working'}
              onClick={() => runImport(false)}
            >
              Import {files.length > 0 ? `${files.length} file(s)` : ''}
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

      {/* ── Scrape configuration + start ─────────────────────────────────────── */}
      {source !== 'import' && (
      <div className={styles.card}>
        <div className={styles.sectionTitle}>
          {source === 'mock' ? 'Mock Data' : 'Portal Session'}
        </div>

        {source === 'mock' ? (
          <div className={styles.statusRow}>
            <span className={styles.statusDot} style={{ background: 'var(--accent-green)' }} />
            <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>
              Ready · generated from the planners loaded in this system, no login needed
            </span>
          </div>
        ) : (
          <>
            <div className={styles.statusRow}>
              <span
                className={styles.statusDot}
                style={{ background: isLoggedIn ? 'var(--accent-green)' : 'var(--text-muted)' }}
              />
              <span style={{ fontSize: 12, color: isLoggedIn ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                {isLoggedIn
                  ? `Connected · ${studentCount.toLocaleString()} students loaded`
                  : 'Not connected'}
              </span>
            </div>

            {!isLoggedIn && (
              <p className={styles.hintText}>
                Log in to the portal via the top-bar button before running estimation.
              </p>
            )}
          </>
        )}

        {/* ID range filter */}
        <div className={styles.rangeRow}>
          <div className={styles.rangeField}>
            <label className={styles.rangeLabel}>Min Student ID</label>
            <input
              className={styles.rangeInput}
              type="number"
              placeholder="e.g. 102780000"
              value={minId}
              onChange={(e) => setMinId(e.target.value)}
              disabled={isRunning}
            />
          </div>
          <div className={styles.rangeField}>
            <label className={styles.rangeLabel}>Max Student ID</label>
            <input
              className={styles.rangeInput}
              type="number"
              placeholder="e.g. 102800000"
              value={maxId}
              onChange={(e) => setMaxId(e.target.value)}
              disabled={isRunning}
            />
          </div>
        </div>
        <p className={styles.hintText} style={{ marginTop: 4 }}>
          Leave both fields empty to process all students.
        </p>

        {/* Action buttons */}
        <div className={styles.actionRow}>
          <button
            className={styles.btnPrimary}
            disabled={!canStartScrape}
            onClick={startEstimation}
          >
            {runStatus === 'done' ? 'Run Again' : 'Start Estimation'}
          </button>
          {isRunning && (
            <button className={styles.btnDanger} onClick={cancelEstimation}>
              Cancel
            </button>
          )}
        </div>
      </div>
      )}

      {/* ── Progress card ────────────────────────────────────────────────────── */}
      {progress && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>{progressCardTitle}</div>

          <div className={styles.progressWrap}>
            <div
              className={`${styles.progressFill} ${isRunning ? styles.progressAnimated : ''}`}
              style={{
                width: `${pct}%`,
                background: runStatus === 'done' ? 'var(--accent-green)' : 'var(--accent-blue)',
              }}
            />
          </div>

          <div className={styles.progressLabel}>
            <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()} students</span>
            <span>{pct}%</span>
          </div>

          {isRunning && progress.studentName && (
            <div className={styles.currentStatus}>
              <span className={styles.spinner} />
              <span className={styles.phaseLabel}>
                {PHASE_LABEL[progress.phase] ?? progress.phase}
              </span>
              <span className={styles.studentName}>{progress.studentName}</span>
            </div>
          )}

          {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}
        </div>
      )}

      {/* ── Summary ──────────────────────────────────────────────────────────── */}
      {summary && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Summary</div>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue} style={{ color: 'var(--accent-green)' }}>
                {summary.completed.toLocaleString()}
              </span>
              <span className={styles.summaryLabel}>Completed</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue} style={{ color: 'var(--accent-yellow)' }}>
                {summary.skipped.toLocaleString()}
              </span>
              <span className={styles.summaryLabel}>Skipped</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue} style={{ color: 'var(--accent-red)' }}>
                {summary.failed.toLocaleString()}
              </span>
              <span className={styles.summaryLabel}>Failed</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue} style={{ color: 'var(--text-primary)' }}>
                {summary.total.toLocaleString()}
              </span>
              <span className={styles.summaryLabel}>Total</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Pipeline preview (Phases 0-3, diagnostic) ────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Pipeline Preview</div>
        <p className={styles.hintText}>
          Runs matching, candidate resolution, eligibility and ranking over whichever students are currently
          loaded, scraped or imported. Nothing is saved. Try it on a small batch first.
        </p>

        {/* The target semester is derived, not picked, so it is stated with the reason rather than offered. */}
        <div className={styles.targetRow}>
          <span className={styles.targetLabel}>Estimating for</span>
          <span className={styles.targetValue}>{preview?.target?.label ?? academicNow.label}</span>
          <span className={styles.targetReason}>{preview?.target?.reason ?? academicNow.reason}</span>
        </div>

        <div className={styles.actionRow}>
          <div className={styles.rangeField}>
            <label className={styles.rangeLabel}>
              Students returning (%){retentionSaved ? ' · saved' : ''}
            </label>
            <input
              className={styles.rangeInput}
              type="number"
              min={1}
              max={100}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              disabled={previewStatus === 'loading' || isRunning}
            />
          </div>
          <button
            className={styles.btnPrimary}
            disabled={previewStatus === 'loading' || isRunning}
            onClick={runPreview}
          >
            {previewStatus === 'loading' ? 'Running…' : 'Run Preview'}
          </button>
          {preview && (
            <button className={styles.btnSecondary} onClick={copyPreview}>
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          )}
        </div>

        {previewError && <div className={styles.errorBox} style={{ marginTop: 12 }}>{previewError}</div>}

        {preview && (
          <>
            <div className={styles.summaryGrid} style={{ marginTop: 16 }}>
              {([
                ['Students', preview.summary.students],
                ['With planner', preview.summary.withPlanner],
                ['Shared core', preview.summary.commonCoreOnly],
                ['Not estimated', preview.summary.noMajorOrPlanner],
                ['Errors', preview.summary.errors],
                ['Candidates', preview.summary.totalCandidates],
                ['Eligible', preview.summary.totalEligible],
                ['Picked', preview.summary.totalPicked],
              ] as const).map(([label, value]) => (
                <div className={styles.summaryItem} key={label}>
                  <span className={styles.summaryValue} style={{ color: 'var(--text-primary)' }}>
                    {value.toLocaleString()}
                  </span>
                  <span className={styles.summaryLabel}>{label}</span>
                </div>
              ))}
            </div>

            <div className={styles.previewNotes}>
              <div>
                Not eligible: {preview.summary.ineligibleByReason['not-offered-in-term']} not offered this semester,{' '}
                {preview.summary.ineligibleByReason['requisites-unmet']} requisites unmet,{' '}
                {preview.summary.ineligibleByReason['not-in-planner']} not in planner
              </div>
              <div>
                Eligible only because the unit has no offering data: {preview.summary.eligibleWithoutOfferingData}
              </div>
              {preview.summary.outsideRecommendedTerm > 0 && (
                <div>
                  Predicted outside the semester their planner recommends: {preview.summary.outsideRecommendedTerm}{' '}
                  (normal for retakes, worth a look if a whole cohort appears here)
                </div>
              )}
              {preview.summary.plannerCounts.map((p) => (
                <div key={p.plannerId}>
                  {p.students} × {p.majorName} ({p.intakeYear} S{p.intakeSemester})
                </div>
              ))}
              {Object.entries(preview.summary.mappingWarningCounts).map(([warning, n]) => (
                <div key={warning}>⚠ {n} × {warning}</div>
              ))}
            </div>

            {/* The actual answer. Everything below this is the workings behind it. */}
            {preview.summary.projectedByUnit.length > 0 && (
              <div className={styles.electiveBlock}>
                <div className={styles.electiveHeading}>
                  Projected enrolment
                  <span className={styles.electiveNote}>
                    {(preview.summary.retentionRate * 100).toFixed(0)}% of students assumed returning
                    {preview.summary.grouping.workSaved > 0 &&
                      ` · ${preview.summary.grouping.groups} distinct situations across ${preview.summary.grouping.students} students`}
                  </span>
                </div>

                <div className={styles.electiveTable}>
                  <div className={`${styles.electiveRow} ${styles.electiveHead}`}>
                    <span>Unit</span>
                    <span>Required</span>
                    <span>Elective</span>
                    <span>Projected</span>
                  </div>
                  {preview.summary.projectedByUnit.slice(0, 40).map((u) => (
                    <div key={u.code} className={styles.electiveRow}>
                      <span className={styles.electiveCode}>{u.code}</span>
                      <span className={styles.electiveNote}>{u.fromNamedPicks || '-'}</span>
                      <span className={styles.electiveNote}>
                        {u.fromElectives > 0 ? u.fromElectives.toFixed(1) : '-'}
                      </span>
                      <span className={styles.electiveSeats}>{Math.round(u.projected)}</span>
                    </div>
                  ))}
                </div>

                <p className={styles.hintText} style={{ marginTop: 8 }}>
                  Required counts whole students the planner says still owe the unit. Elective counts shares
                  of a student spread over the options they could pick. Projected is both, after the
                  returning-students rate, rounded for display only.
                </p>
              </div>
            )}

            {/* Electives are predicted as shares of a seat, never as named picks, so they get their own
                table rather than sitting in the picked list and looking like certainties. */}
            {preview.summary.electiveSeatsByUnit.length > 0 && (
              <div className={styles.electiveBlock}>
                <div className={styles.electiveHeading}>
                  Expected elective enrolment
                  <span className={styles.electiveNote}>
                    fractional on purpose, each student is spread over the electives they could take
                  </span>
                </div>

                <div className={styles.electiveTable}>
                  <div className={`${styles.electiveRow} ${styles.electiveHead}`}>
                    <span>Unit</span>
                    <span>Type</span>
                    <span>Taken by</span>
                    <span>Expected</span>
                  </div>
                  {preview.summary.electiveSeatsByUnit.slice(0, 30).map((u) => (
                    <div key={u.code} className={styles.electiveRow}>
                      <span className={styles.electiveCode}>{u.code}</span>
                      <span className={styles.electiveNote}>
                        {u.category === 'mixed' ? 'both' : u.category === 'prescribed' ? 'prescribed' : 'free'}
                      </span>
                      <span className={styles.electiveNote}>{u.popularity}</span>
                      <span className={styles.electiveSeats}>{u.expectedSeats.toFixed(1)}</span>
                    </div>
                  ))}
                </div>

                {preview.summary.electiveSeatsUnplaced > 0 && (
                  <p className={styles.hintText} style={{ marginTop: 8 }}>
                    {preview.summary.electiveSeatsUnplaced.toFixed(1)} elective seat(s) could not be placed:
                    those students owe a slot but every unit in their pool is either not running next
                    semester or has requisites they have not met.
                  </p>
                )}
              </div>
            )}

            <div className={styles.previewList}>
              {preview.students.slice(0, 200).map((s) => (
                <details key={s.studentId} className={styles.previewRow}>
                  <summary>
                    <span>{s.name} ({s.studentId})</span>
                    <span className={styles.previewMeta}>
                      {s.error
                        ? `error: ${s.error}`
                        : s.planner
                          ? `${s.planner.majorName} ${s.planner.matchPct.toFixed(0)}% · ${s.candidateCount} candidates → ${s.eligibleCount} eligible → ${s.picked.length} picked`
                          : s.basis === 'commonCore'
                            ? `shared core, major not detectable yet · ${s.candidateCount} candidates → ${s.eligibleCount} eligible → ${s.picked.length} picked`
                            : `not estimated (${s.matchStatus ?? 'n/a'})`}
                    </span>
                  </summary>
                  <pre className={styles.previewPre}>{JSON.stringify(s, null, 2)}</pre>
                </details>
              ))}
              {preview.students.length > 200 && (
                <p className={styles.hintText}>
                  Showing the first 200 of {preview.students.length.toLocaleString()} students. Copy JSON includes all of them.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Log ──────────────────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>
            Log
            <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              ({log.length.toLocaleString()} entries)
            </span>
          </div>
          <div className={styles.logWrap}>
            {log.map((entry) => (
              <div
                key={entry.key}
                className={`${styles.logEntry} ${logEntryClass[entry.type]}`}
              >
                <span className={styles.logIcon}>{logIcon[entry.type]}</span>
                {entry.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

    </div>
  );
}
