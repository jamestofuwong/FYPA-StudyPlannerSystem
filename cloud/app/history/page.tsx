'use client';

import { MOCK_PARSE_HISTORY, type ParseRun } from '../../lib/mock-data';
import RunLogs from '../../components/RunLogs';

const STATUS_CONFIG: Record<ParseRun['status'], { dot: string; label: string; color: string; bg: string }> = {
  success: { dot: '#15803D', label: 'Success', color: 'var(--green)',  bg: 'var(--green-light)' },
  failed:  { dot: '#DC2626', label: 'Failed',  color: 'var(--red)',    bg: 'var(--red-light)' },
  partial: { dot: '#D97706', label: 'Partial', color: 'var(--yellow)', bg: 'var(--yellow-light)' },
  running: { dot: '#2563EB', label: 'Running', color: 'var(--blue)',   bg: 'var(--blue-light)' },
};

function RunStatusBadge({ status }: { status: ParseRun['status'] }) {
  const s = STATUS_CONFIG[status];
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
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HistoryPage() {
  const successCount = MOCK_PARSE_HISTORY.filter(r => r.status === 'success').length;
  const totalNew = MOCK_PARSE_HISTORY.reduce((s, r) => s + r.plannersNew, 0);
  const totalUpdated = MOCK_PARSE_HISTORY.reduce((s, r) => s + r.plannersUpdated, 0);

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' }}>
          Parse History
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Automated daily runs that check the portal for new or updated planners.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 200px))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Runs', value: MOCK_PARSE_HISTORY.length, note: `${successCount} successful` },
          { label: 'New Planners', value: totalNew, note: 'across all runs' },
          { label: 'Planners Updated', value: totalUpdated, note: 'content changes detected' },
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

      {/* Run list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MOCK_PARSE_HISTORY.map((run) => (
          <div key={run.id} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}>
            {/* Left accent stripe by status */}
            <div style={{
              display: 'flex',
              borderLeft: `4px solid ${STATUS_CONFIG[run.status].dot}`,
            }}>
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
                      {formatDateTime(run.triggeredAt)}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{run.source}</div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                    {[
                      { label: 'Scanned', value: run.plannersScanned, color: undefined },
                      { label: 'New', value: run.plannersNew, color: run.plannersNew > 0 ? 'var(--green)' : undefined },
                      { label: 'Updated', value: run.plannersUpdated, color: run.plannersUpdated > 0 ? 'var(--orange)' : undefined },
                      { label: 'Unchanged', value: run.plannersUnchanged, color: undefined },
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
                    {formatDuration(run.durationMs)}
                  </div>
                </div>

                {/* Error bar */}
                {run.errorMessage && (
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
                    {run.errorMessage}
                  </div>
                )}

                {/* Logs */}
                <RunLogs logs={run.logs} />
              </div>
            </div>
          </div>
        ))}
      </div>
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
