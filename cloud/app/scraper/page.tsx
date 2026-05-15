'use client';

import { useRef, useState } from 'react';
import type { PlannerIndexEntry, PlannerDiff } from '@core/services/plannerScraper/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Action = 'check' | 'sync';
type RunState = 'idle' | 'running' | 'done' | 'error';

interface LogLine {
  text: string;
  color: string;
}

interface CheckResult {
  totalScraped: number;
  diff: PlannerDiff;
}

interface SyncResult {
  totalScraped: number;
  diff: PlannerDiff;
  parsed: number;
  parseFailed: number;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logColor(line: string): string {
  if (line.startsWith('✓')) return '#86EFAC';
  if (line.startsWith('✗')) return '#FCA5A5';
  if (line.startsWith('→')) return '#93C5FD';
  return '#A3A3A3';
}

function parseLogLines(messages: string[]): LogLine[] {
  return messages.filter(Boolean).map(text => ({ text, color: logColor(text) }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function StepIndicator({ stepLabel }: { stepLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--orange)',
        display: 'inline-block',
        boxShadow: '0 0 0 3px var(--orange-light)',
        animation: 'pulse 1.5s infinite',
      }} />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
        {stepLabel}
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function LogTerminal({ lines, runState }: { lines: LogLine[]; runState: RunState }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Terminal bar */}
      <div style={{
        background: '#1D1D1D',
        padding: '7px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F56', '#FFBD2E', '#27C93F'].map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#525252' }}>scraper.log</span>
        <span style={{ fontSize: 10, color: runState === 'running' ? '#FFBD2E' : runState === 'done' ? '#27C93F' : runState === 'error' ? '#FF5F56' : '#525252' }}>
          {runState === 'running' ? '● running' : runState === 'done' ? '● done' : runState === 'error' ? '● error' : '○ idle'}
        </span>
      </div>

      {/* Log body */}
      <div style={{
        background: '#111',
        minHeight: 280,
        maxHeight: 420,
        overflowY: 'auto',
        padding: '12px 16px',
        fontFamily: 'Menlo, Consolas, Monaco, monospace',
        fontSize: 11,
        lineHeight: 1.75,
      }}>
        {lines.length === 0 ? (
          <span style={{ color: '#3D3D3D' }}>Run a workflow to see logs here.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <span style={{ color: '#3D3D3D', flexShrink: 0, userSelect: 'none', minWidth: 22 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ color: line.color }}>{line.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

function groupByYearAndLevel(entries: PlannerIndexEntry[]): Map<string, Map<string, PlannerIndexEntry[]>> {
  const grouped = new Map<string, Map<string, PlannerIndexEntry[]>>();
  const sorted = [...entries].sort((a, b) => b.year.localeCompare(a.year));
  for (const entry of sorted) {
    const level = entry.programLevel || 'Unknown';
    if (!grouped.has(entry.year)) grouped.set(entry.year, new Map());
    const byLevel = grouped.get(entry.year)!;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(entry);
  }
  return grouped;
}

const LEVEL_DOT: Record<string, string> = {
  Undergraduate: '#2563EB',
  Postgraduate:  '#7C3AED',
};

const INITIAL_SHOW = 5; // rows visible before "show more"

// ---------------------------------------------------------------------------
// LevelCard — one program level group with a "show more" toggle
// ---------------------------------------------------------------------------

function LevelCard({
  level, entries, accentColor,
}: {
  level: string;
  entries: PlannerIndexEntry[];
  accentColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const clipped = !expanded && entries.length > INITIAL_SHOW;
  const visible = clipped ? entries.slice(0, INITIAL_SHOW) : entries;
  const hidden = entries.length - INITIAL_SHOW;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Level sub-header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-raised)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: LEVEL_DOT[level] ?? '#A3A3A3', display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{level}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entries.length} planner(s)</span>
      </div>

      {/* Entry rows */}
      {visible.map((entry, i) => (
        <div key={i} style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0, display: 'inline-block' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{entry.courseName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              <code style={{ fontFamily: 'monospace' }}>{entry.unitCode}</code>
              {entry.intakeMonth && ` · ${entry.intakeMonth}`}
              {entry.lastUpdated && ` · Updated ${entry.lastUpdated}`}
            </div>
          </div>
        </div>
      ))}

      {/* Show more / show less */}
      {entries.length > INITIAL_SHOW && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderTop: clipped ? '1px solid var(--border)' : undefined,
            fontSize: 12,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
        >
          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.15s', fontSize: 14, lineHeight: 1 }}>›</span>
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YearAccordion — collapsible year section
// ---------------------------------------------------------------------------

function YearAccordion({
  year, byLevel, accentColor, defaultOpen,
}: {
  year: string;
  byLevel: Map<string, PlannerIndexEntry[]>;
  accentColor: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const total = Array.from(byLevel.values()).reduce((s, a) => s + a.length, 0);

  return (
    <div>
      {/* Year heading — clickable */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          fontSize: 14, color: 'var(--text-muted)', lineHeight: 1, flexShrink: 0,
        }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{year}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{total} planner(s)</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from(byLevel.entries()).map(([level, levelEntries]) => (
            <LevelCard key={level} level={level} entries={levelEntries} accentColor={accentColor} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffSection — collapsible top-level "New Planners" / "Updated Planners" block
// ---------------------------------------------------------------------------

function DiffSection({
  title, count, entries, accentColor, headerColor,
}: {
  title: string;
  count: number;
  entries: PlannerIndexEntry[];
  accentColor: string;
  headerColor: string;
}) {
  const [open, setOpen] = useState(true);
  const grouped = groupByYearAndLevel(entries);
  const years = Array.from(grouped.keys());

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'var(--surface-raised)', border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          padding: '11px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          fontSize: 14, color: 'var(--text-muted)', lineHeight: 1,
        }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{title}</span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          background: headerColor === 'var(--green)' ? 'var(--green-light)' : 'var(--orange-light)',
          color: headerColor,
          padding: '2px 8px', borderRadius: 20,
        }}>
          {count}
        </span>
      </button>

      {/* Grouped content */}
      {open && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {years.map((year, i) => (
            <YearAccordion
              key={year}
              year={year}
              byLevel={grouped.get(year)!}
              accentColor={accentColor}
              defaultOpen={i === 0} // only first year open by default
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffResult
// ---------------------------------------------------------------------------

function DiffResult({ result, onSync, syncing }: { result: CheckResult; onSync: () => void; syncing: boolean }) {
  const { diff, totalScraped } = result;
  const hasChanges = diff.newEntries.length > 0 || diff.updatedEntries.length > 0;
  const changeCount = diff.newEntries.length + diff.updatedEntries.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Scanned',   value: totalScraped,               color: 'var(--text-primary)', bg: 'var(--gray-light)' },
          { label: 'New',       value: diff.newEntries.length,      color: diff.newEntries.length > 0 ? 'var(--green)' : 'var(--text-muted)',   bg: diff.newEntries.length > 0 ? 'var(--green-light)' : 'var(--gray-light)' },
          { label: 'Updated',   value: diff.updatedEntries.length,  color: diff.updatedEntries.length > 0 ? 'var(--orange)' : 'var(--text-muted)', bg: diff.updatedEntries.length > 0 ? 'var(--orange-light)' : 'var(--gray-light)' },
          { label: 'Unchanged', value: totalScraped - changeCount,  color: 'var(--text-muted)', bg: 'var(--gray-light)' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ flex: 1, background: bg, borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Sync Updates button */}
      {hasChanges && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              {changeCount} planner{changeCount !== 1 ? 's' : ''} ready to sync
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Save the new and updated entries to the database.
            </div>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            style={{
              padding: '8px 20px',
              background: syncing ? 'var(--gray-light)' : 'var(--orange)',
              color: syncing ? 'var(--text-muted)' : '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: 13,
              cursor: syncing ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!syncing) (e.currentTarget as HTMLElement).style.background = 'var(--orange-hover)'; }}
            onMouseLeave={e => { if (!syncing) (e.currentTarget as HTMLElement).style.background = 'var(--orange)'; }}
          >
            {syncing ? 'Syncing…' : 'Sync Updates'}
          </button>
        </div>
      )}

      {/* Grouped entry lists */}
      {hasChanges && [
        { title: 'New Planners',     entries: diff.newEntries,     accentColor: 'var(--green)',  headerColor: 'var(--green)' },
        { title: 'Updated Planners', entries: diff.updatedEntries, accentColor: 'var(--orange)', headerColor: 'var(--orange)' },
      ].filter(g => g.entries.length > 0).map(g => (
        <DiffSection
          key={g.title}
          title={g.title}
          count={g.entries.length}
          entries={g.entries}
          accentColor={g.accentColor}
          headerColor={g.headerColor}
        />
      ))}

      {!hasChanges && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 13 }}>
          All planners are up to date.
        </div>
      )}
    </div>
  );
}

function SyncSuccessBanner({ result }: { result: SyncResult }) {
  const total = (result.diff?.newEntries?.length ?? 0) + (result.diff?.updatedEntries?.length ?? 0);
  return (
    <div style={{
      background: 'var(--green-light)',
      border: '1px solid var(--green-border, #BBF7D0)',
      borderRadius: 'var(--radius)',
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>✓</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
          Sync complete
        </div>
        <div style={{ fontSize: 12, color: 'var(--green)', opacity: 0.8, marginTop: 2 }}>
          {total} planner{total !== 1 ? 's' : ''} saved
          {result.parsed > 0 && ` — ${result.parsed} parsed`}
          {result.parseFailed > 0 && `, ${result.parseFailed} failed to parse`}
        </div>
      </div>
      {result.parseFailed > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#D97706',
          background: '#FEF3C7', padding: '2px 8px', borderRadius: 20,
        }}>
          {result.parseFailed} error{result.parseFailed !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScraperPage() {
  const [runState, setRunState] = useState<RunState>('idle');
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [currentStepLabel, setCurrentStepLabel] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; description: string } | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isRunning = runState === 'running';
  const isSyncing = isRunning && activeAction === 'sync';

  async function startRun(action: Action) {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setActiveAction(action);
    setRunState('running');
    setLogs([]);
    setCurrentStepLabel('Connecting...');
    setProgress(null);
    if (action === 'check') {
      setCheckResult(null);
      setSyncResult(null);
    } else {
      setSyncResult(null);
    }

    try {
      const res = await fetch(`/api/scraper/run?action=${action}`, {
        method: 'POST',
        signal: abort.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(action, event);
          } catch { /* malformed chunk */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setLogs(prev => [...prev, { text: `✗ Connection error: ${(e as Error).message}`, color: '#FCA5A5' }]);
      setRunState('error');
    }
  }

  function handleEvent(action: Action, event: Record<string, unknown>) {
    switch (event.type) {
      case 'step':
        setCurrentStepLabel(event.label as string);
        break;
      case 'log':
        setLogs(prev => [...prev, ...parseLogLines(event.messages as string[])]);
        break;
      case 'progress':
        setProgress({
          current: event.current as number,
          total: event.total as number,
          description: event.description as string,
        });
        break;
      case 'result': {
        if (action === 'check') {
          setCheckResult(event.data as CheckResult);
        } else {
          setSyncResult(event.data as SyncResult);
        }
        break;
      }
      case 'error':
        setLogs(prev => [...prev, { text: `✗ ${event.message}`, color: '#FCA5A5' }]);
        setRunState('error');
        setCurrentStepLabel('');
        break;
      case 'done':
        setRunState(prev => prev === 'error' ? 'error' : 'done');
        setCurrentStepLabel('');
        setProgress(null);
        break;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunState('idle');
    setActiveAction(null);
    setCurrentStepLabel('');
    setProgress(null);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      {/* Page header with Check button */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
            Planner Scraper
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Check the university portal for new or updated study planners.
          </p>
        </div>
        <button
          onClick={() => startRun('check')}
          disabled={isRunning}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 18px',
            background: isRunning ? 'var(--gray-light)' : 'var(--orange)',
            color: isRunning ? 'var(--text-muted)' : '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: 13,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!isRunning) (e.currentTarget as HTMLElement).style.background = 'var(--orange-hover)'; }}
          onMouseLeave={e => { if (!isRunning) (e.currentTarget as HTMLElement).style.background = 'var(--orange)'; }}
        >
          <RefreshIcon spinning={isRunning && activeAction === 'check'} />
          {isRunning && activeAction === 'check' ? 'Checking…' : 'Check for Updates'}
        </button>
      </div>

      {/* Status bar */}
      {(isRunning || currentStepLabel) && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            {isRunning && <StepIndicator stepLabel={currentStepLabel} />}
            {progress && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', minWidth: 0 }}>
                <span style={{
                  background: 'var(--orange-light)', color: 'var(--orange)',
                  fontWeight: 600, padding: '1px 7px', borderRadius: 20, fontSize: 11, flexShrink: 0,
                }}>
                  {progress.current}/{progress.total}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.description}
                </span>
              </div>
            )}
          </div>
          {isRunning && (
            <button
              onClick={handleStop}
              style={{
                padding: '4px 12px', background: 'none',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)', fontSize: 12,
                color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {/* Log terminal */}
      <div style={{ marginBottom: 20 }}>
        <LogTerminal lines={logs} runState={runState} />
      </div>

      {/* Check results + sync button */}
      {checkResult && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            Results
          </div>
          <DiffResult result={checkResult} onSync={() => startRun('sync')} syncing={isSyncing} />
        </div>
      )}

      {/* Sync success banner */}
      {syncResult !== null && (
        <div style={{ marginTop: checkResult ? 20 : 0 }}>
          <SyncSuccessBanner result={syncResult} />
        </div>
      )}
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, animation: spinning ? 'spin 1s linear infinite' : 'none' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
