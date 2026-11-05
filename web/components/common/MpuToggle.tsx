'use client';

import { fs, radius } from '../../styles/tokens';
import { useStudentSession } from '../providers/StudentSessionContext';

/**
 * Switch that shows or hides the MPU units on Major Detection and Student Pathway. It only changes what is drawn,
 * so an advisor who does not need the general studies units can concentrate on the main units.
 */
export default function MpuToggle({ hiddenNote }: { hiddenNote?: string }) {
  const { showMpu, setShowMpu } = useStudentSession();
  return (
    <div data-testid="mpu-toggle-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, margin: '0 0 8px' }}>
      {!showMpu && hiddenNote && (
        <span data-testid="mpu-hidden-note" style={{ fontSize: fs(11), color: 'var(--text-muted)' }}>{hiddenNote}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={showMpu}
        data-testid="mpu-toggle"
        data-tour="mpu-toggle"
        onClick={() => setShowMpu(!showMpu)}
        title={showMpu ? 'Hide the MPU units to focus on the main units' : 'Show the MPU units again'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 10px',
          fontSize: fs(12), fontFamily: 'inherit', cursor: 'pointer', color: 'var(--text-primary, inherit)',
          background: 'transparent', border: '1px solid var(--panel-border, #888)', borderRadius: radius(14),
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'relative', width: 26, height: 14, borderRadius: 7, flex: '0 0 auto',
            background: showMpu ? 'var(--active-highlight, #0078d4)' : 'var(--panel-border, #888)', transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: showMpu ? 14 : 2, width: 10, height: 10, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
          }} />
        </span>
        Show MPU units
      </button>
    </div>
  );
}
