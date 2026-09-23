import { ProgressBar } from './Primitives';

export function getMinorProgress(minor: any, doneCodes: Set<string>) {
  const total: number = minor.units.length;
  const done: number = minor.units.filter(
    (mu: any) => doneCodes.has(mu.unit?.unit_code?.trim().toUpperCase())
  ).length;
  const missing: number = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, missing, pct };
}

export default function MinorProgressCard({ minor, doneCodes }: { minor: any; doneCodes: Set<string> }) {
  const { total, done, missing, pct } = getMinorProgress(minor, doneCodes);

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(197,134,192,0.3)',
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
        {missing === 0 && (
          <span style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 600 }}>✓ Complete</span>
        )}
      </div>
      <ProgressBar pct={pct} color={pct === 100 ? 'var(--accent-green)' : 'var(--accent-yellow)'} />
    </div>
  );
}
