'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';

type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';
type RunStatus = 'idle' | 'running' | 'done' | 'error';

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

  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

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
  }, [minId, maxId]);

  const isLoggedIn = sessionStatus === 'logged-in';
  const isRunning  = runStatus === 'running';
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

      {/* ── Configuration + start ────────────────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.sectionTitle}>Portal Session</div>

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
            disabled={!isLoggedIn || isRunning}
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
