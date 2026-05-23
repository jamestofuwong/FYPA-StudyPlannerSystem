'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';
import { useTheme, type ThemePreference } from '../../../styles/themeProvider';

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System',          description: 'Follows your OS theme preference' },
  { value: 'light',  label: 'Light',           description: 'Always use the light theme' },
  { value: 'dark',   label: 'Dark',            description: 'Always use the dark theme' },
  { value: 'portal', label: 'Original Portal', description: 'Matches the student portal — dark sidebar, white content, steel blue accents' },
];

type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'not-available' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const [update, setUpdate] = useState<UpdateStatus>({ status: 'idle' });
  const appVersion = process.env.APP_VERSION ?? '—';

  useEffect(() => {
    const api = (window as any).updaterAPI;
    if (!api) return;
    api.onStatus((payload: Record<string, unknown>) => {
      setUpdate(payload as UpdateStatus);
    });
  }, []);

  const handleCheck = () => {
    const api = (window as any).updaterAPI;
    if (!api) return;
    setUpdate({ status: 'checking' });
    api.check();
  };

  return (
    <div className={styles.panel}>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle}>Appearance</div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Theme</div>
        <div className={styles.themeOptions}>
          {THEME_OPTIONS.map((opt) => {
            const active = preference === opt.value;
            return (
              <button
                key={opt.value}
                className={`${styles.themeOption} ${active ? styles.themeOptionActive : ''}`}
                onClick={() => setPreference(opt.value)}
              >
                <span className={styles.themeOptionLabel}>{opt.label}</span>
                <span className={styles.themeOptionDesc}>{opt.description}</span>
                {active && <span className={styles.themeOptionCheck}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Updates ──────────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle}>Updates</div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Application Update</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Current version: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>v{appVersion}</span>
          </div>
        </div>

        {/* Status display */}
        {update.status === 'idle' && (
          <div style={statusRow}>
            <span style={dot('#6b6b6b')} />
            <span style={statusText}>Not checked yet</span>
          </div>
        )}
        {update.status === 'checking' && (
          <div style={statusRow}>
            <span style={dot('#569cd6')} />
            <span style={statusText}>Checking for updates…</span>
          </div>
        )}
        {update.status === 'not-available' && (
          <div style={statusRow}>
            <span style={dot('#4ec9b0')} />
            <span style={statusText}>You're on the latest version.</span>
          </div>
        )}
        {update.status === 'available' && (
          <div style={statusRow}>
            <span style={dot('#569cd6')} />
            <span style={{ ...statusText, flex: 1 }}>
              Version <strong>v{update.version}</strong> is available
            </span>
          </div>
        )}
        {update.status === 'downloading' && (
          <div style={{ ...statusRow, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={dot('#569cd6')} />
              <span style={statusText}>Downloading… {update.percent}%</span>
            </div>
            <div style={{ width: '100%', height: 4, background: 'var(--panel-border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${update.percent}%`, height: '100%', background: '#569cd6', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
        {update.status === 'downloaded' && (
          <div style={statusRow}>
            <span style={dot('#4ec9b0')} />
            <span style={{ ...statusText, flex: 1 }}>
              Version <strong>v{update.version}</strong> downloaded and ready to install
            </span>
          </div>
        )}
        {update.status === 'error' && (
          <div style={statusRow}>
            <span style={dot('#f48771')} />
            <span style={{ ...statusText, color: 'var(--accent-red)', flex: 1 }}>Error: {update.message}</span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {(update.status === 'idle' || update.status === 'not-available' || update.status === 'error') && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px' }} onClick={handleCheck}>
              <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto' }}>Check for Updates</span>
            </button>
          )}
          {update.status === 'available' && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px', borderColor: '#569cd6' }} onClick={() => (window as any).updaterAPI?.download()}>
              <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto', color: '#569cd6' }}>Download v{update.version}</span>
            </button>
          )}
          {update.status === 'downloaded' && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px', borderColor: '#4ec9b0' }} onClick={() => (window as any).updaterAPI?.install()}>
              <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto', color: '#4ec9b0' }}>Restart & Install</span>
            </button>
          )}
          {update.status === 'checking' && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px', opacity: 0.5 }} disabled>
              <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto' }}>Checking…</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

const statusRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const statusText: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)',
};

const dot = (color: string): React.CSSProperties => ({
  width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
});
