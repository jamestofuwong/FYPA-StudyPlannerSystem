'use client';

import { useEffect, useState } from 'react';

type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'not-available' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateStatus>({ status: 'idle' });

  useEffect(() => {
    // updaterAPI is injected by the Electron preload — not present in browser/dev
    const api = (window as any).updaterAPI;
    if (!api) return;

    api.onStatus((payload: Record<string, unknown>) => {
      setUpdate(payload as UpdateStatus);
    });
  }, []);

  // Nothing to show in most states
  if (
    update.status === 'idle' ||
    update.status === 'checking' ||
    update.status === 'not-available'
  ) return null;

  if (update.status === 'error') {
    return (
      <div style={bannerStyle('#3a1a1a', 'rgba(244,135,113,0.15)', '#f48771')}>
        <span style={dotStyle('#f48771')} />
        <span style={textStyle}>Update check failed: {update.message}</span>
        <button onClick={() => setUpdate({ status: 'idle' })} style={dismissStyle}>Dismiss</button>
      </div>
    );
  }

  if (update.status === 'available') {
    return (
      <div style={bannerStyle('#1a2a3a', 'rgba(86,156,214,0.15)', '#569cd6')}>
        <span style={dotStyle('#569cd6')} />
        <span style={textStyle}>
          Version <strong>{update.version}</strong> is available
        </span>
        <button
          onClick={() => (window as any).updaterAPI?.download()}
          style={actionStyle('#569cd6')}
        >
          Download
        </button>
        <button onClick={() => setUpdate({ status: 'idle' })} style={dismissStyle}>Later</button>
      </div>
    );
  }

  if (update.status === 'downloading') {
    return (
      <div style={bannerStyle('#1a2a3a', 'rgba(86,156,214,0.15)', '#569cd6')}>
        <span style={dotStyle('#569cd6')} />
        <span style={textStyle}>Downloading update… {update.percent}%</span>
        <div style={{
          flex: 1, maxWidth: 120, height: 3,
          background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            width: `${update.percent}%`, height: '100%',
            background: '#569cd6', transition: 'width 0.3s',
          }} />
        </div>
      </div>
    );
  }

  if (update.status === 'downloaded') {
    return (
      <div style={bannerStyle('#1a3a1a', 'rgba(78,201,176,0.15)', '#4ec9b0')}>
        <span style={dotStyle('#4ec9b0')} />
        <span style={textStyle}>
          Version <strong>{update.version}</strong> ready to install
        </span>
        <button
          onClick={() => (window as any).updaterAPI?.install()}
          style={actionStyle('#4ec9b0')}
        >
          Restart & Install
        </button>
        <button onClick={() => setUpdate({ status: 'idle' })} style={dismissStyle}>Later</button>
      </div>
    );
  }

  return null;
}

// ── Inline styles consistent with the app's dark theme ───────────────────────

function bannerStyle(bg: string, border: string, _accent: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '5px 14px',
    background: bg,
    borderBottom: `1px solid ${border}`,
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    flexShrink: 0,
    minHeight: 32,
  };
}

function dotStyle(color: string): React.CSSProperties {
  return {
    width: 7, height: 7,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  };
}

const textStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  flex: 1,
};

function actionStyle(color: string): React.CSSProperties {
  return {
    padding: '3px 10px',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    background: color,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    flexShrink: 0,
  };
}

const dismissStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 3,
  fontSize: 11,
  color: 'var(--text-muted)',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  flexShrink: 0,
};
