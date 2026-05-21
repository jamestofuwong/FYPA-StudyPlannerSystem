'use client';

import { useEffect, useState } from 'react';
import RunLogs from '../../../components/RunLogs';

interface SyncRun {
  id: string;
  triggered_at: string;
  completed_at: string | null;
  status: string;
  action: string;
  trigger_source: string;
  planners_scanned: number;
  planners_new: number;
  planners_updated: number;
  planners_unchanged: number;
  planners_db_saved: number;
  planners_db_failed: number;
  planners_parse_ok: number;
  planners_parse_failed: number;
  duration_ms: number | null;
  error_message: string | null;
  logs: string[];
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string; bg: string }> = {
  success: { dot: '#15803D', label: 'Success', color: 'var(--green)',  bg: 'var(--green-light)' },
  failed:  { dot: '#DC2626', label: 'Failed',  color: 'var(--red)',    bg: 'var(--red-light)' },
  partial: { dot: '#D97706', label: 'Partial', color: 'var(--yellow)', bg: 'var(--yellow-light)' },
  running: { dot: '#2563EB', label: 'Running', color: 'var(--blue)',   bg: 'var(--blue-light)' },
};

const ACTION_LABEL: Record<string, string> = {
  check:  'Check',
  sync:   'Sync',
  resync: 'Force Resync',
};

function RunStatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? STATUS_CONFIG.running;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  );
}

function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then((data: SyncRun[]) => { setRuns(data); setLoading(false); })
      .catch(() => { setError('Failed to load run history from database.'); setLoading(false); });
  }, []);

  const successCount = runs.filter(r => r.status === 'success').length;
  const totalNew = runs.reduce((s, r) => s + r.planners_new, 0);
  const totalUpdated = runs.reduce((s, r) => s + r.planners_updated, 0);

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' }}>
          Sync History
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          All scraper runs triggered manually or by the scheduler.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 200px))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Runs', value: loading ? '—' : runs.length, note: loading ? '' : `${successCount} successful` },
          { label: 'New Planners', value: loading ? '—' : totalNew, note: 'across all runs' },
          { label: 'Planners Updated', value: loading ? '—' : totalUpdated, note: 'content changes detected' },
        ].map(({ label, value, note }) => (
          <div key={label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note}</div>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading history…
        </div>
      )}

      {error && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>{error}</div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🗂️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No runs yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Trigger a scraper action from the Planner Scraper page to record your first run.
          </div>
        </div>
      )}

      {/* Run list */}
      {!loading && !error && runs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {runs.map((run) => {
            const statusCfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.running;
            return (
              <div key={run.id} style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', borderLeft: `4px solid ${statusCfg.dot}` }}>
                  <div style={{ flex: 1 }}>
                    {/* Run row */}
                    <div style={{
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}>
                      <RunStatusBadge status={run.status} />

                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>
                          {formatDateTime(run.triggered_at)}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {ACTION_LABEL[run.action] ?? run.action} · {run.trigger_source}
                        </div>
                      </div>

                      {/* Scan stats — always shown */}
                      <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                        {[
                          { label: 'Scanned',   value: run.planners_scanned,   color: undefined },
                          { label: 'New',       value: run.planners_new,       color: run.planners_new > 0 ? 'var(--green)' : undefined },
                          { label: 'Updated',   value: run.planners_updated,   color: run.planners_updated > 0 ? 'var(--orange)' : undefined },
                          { label: 'Unchanged', value: run.planners_unchanged, color: undefined },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                        fontFamily: 'monospace',
                        background: 'var(--gray-light)',
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        {formatDuration(run.duration_ms)}
                      </div>
                    </div>

                    {/* Sync metrics — only for sync runs */}
                    {run.action === 'sync' && (
                      <div style={{
                        padding: '10px 20px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 24,
                        background: 'var(--surface-raised)',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                          Database
                        </span>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <MetricPill value={run.planners_db_saved} label="saved" activeColor="var(--green)" active={run.planners_db_saved > 0} />
                          <MetricPill value={run.planners_db_failed} label="failed" activeColor="var(--red)" active={run.planners_db_failed > 0} />
                        </div>
                        <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                          Parsing
                        </span>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <MetricPill value={run.planners_parse_ok} label="parsed" activeColor="var(--green)" active={run.planners_parse_ok > 0} />
                          <MetricPill value={run.planners_parse_failed} label="failed" activeColor="var(--orange)" active={run.planners_parse_failed > 0} />
                        </div>
                      </div>
                    )}

                    {/* Error bar */}
                    {run.error_message && (
                      <div style={{
                        padding: '8px 20px',
                        background: 'var(--red-light)',
                        borderTop: '1px solid var(--red-border)',
                        fontSize: 12,
                        color: 'var(--red)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <WarningIcon />
                        {run.error_message}
                      </div>
                    )}

                    <RunLogs logs={run.logs} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricPill({ value, label, activeColor, active }: { value: number; label: string; activeColor: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: active ? activeColor : 'var(--text-muted)' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
