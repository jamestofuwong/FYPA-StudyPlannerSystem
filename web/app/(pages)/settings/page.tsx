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

const DEFAULT_THRESHOLD = 70; // 70 %

const AGENT_MODEL_OPTIONS = ['llama3.2:3b', 'phi4-mini', 'qwen2.5:3b'] as const;
type AgentModelOption = typeof AGENT_MODEL_OPTIONS[number];
const DEFAULT_AGENT_MODEL: AgentModelOption = 'llama3.2:3b';

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const [update, setUpdate] = useState<UpdateStatus>({ status: 'idle' });
  const appVersion = process.env.APP_VERSION ?? '—';

  // REQ-FUN-610: second major detection threshold
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [thresholdLoading, setThresholdLoading] = useState(false);

  // AI Agent model settings
  const [agentModel, setAgentModel] = useState<AgentModelOption>(DEFAULT_AGENT_MODEL);
  const [agentModelSaved, setAgentModelSaved] = useState(false);
  const [agentModelLoading, setAgentModelLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');
  const [modelStatus, setModelStatus] = useState<'unknown' | 'ready' | 'pulling' | 'unavailable'>('unknown');
  const [pullProgress, setPullProgress] = useState<number>(0);
  const [isPulling, setIsPulling] = useState(false);

  // Load stored threshold on mount
  useEffect(() => {
    fetch('/api/config?key=second_major_threshold')
      .then((r) => r.json())
      .then((d) => { if (d.value !== null) setThreshold(Math.round(parseFloat(d.value) * 100)); })
      .catch(() => {});
  }, []);

  // Load agent model and Ollama status on mount
  useEffect(() => {
    fetch('/api/config?key=agent_model')
      .then((r) => r.json())
      .then((d) => {
        if (d.value && AGENT_MODEL_OPTIONS.includes(d.value as AgentModelOption)) {
          setAgentModel(d.value as AgentModelOption);
        }
      })
      .catch(() => {});

    fetch('/api/ollama/status')
      .then((r) => r.json())
      .then((d) => {
        setOllamaStatus(d.ollama ?? 'unknown');
        setModelStatus(d.model ?? 'unknown');
        setPullProgress(d.pullProgress ?? 0);
      })
      .catch(() => {});
  }, []);

  const handleSaveThreshold = async () => {
    setThresholdLoading(true);
    setThresholdSaved(false);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'second_major_threshold', value: String(threshold / 100) }),
      });
      setThresholdSaved(true);
      setTimeout(() => setThresholdSaved(false), 2500);
    } catch {}
    setThresholdLoading(false);
  };

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

  const handleSaveAgentModel = async () => {
    setAgentModelLoading(true);
    setAgentModelSaved(false);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'agent_model', value: agentModel }),
      });
      setAgentModelSaved(true);
      setTimeout(() => setAgentModelSaved(false), 2500);
    } catch {}
    setAgentModelLoading(false);
  };

  const handlePullModel = async () => {
    setIsPulling(true);
    setModelStatus('pulling');
    setPullProgress(0);
    try {
      await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: agentModel }),
      });
      // Poll status until ready or error
      const poll = setInterval(async () => {
        try {
          const r = await fetch('/api/ollama/status');
          const d = await r.json();
          setOllamaStatus(d.ollama ?? 'unknown');
          setModelStatus(d.model ?? 'unknown');
          setPullProgress(d.pullProgress ?? 0);
          if (d.model !== 'pulling') {
            clearInterval(poll);
            setIsPulling(false);
          }
        } catch {
          clearInterval(poll);
          setIsPulling(false);
        }
      }, 2000);
    } catch {
      setIsPulling(false);
      setModelStatus('unavailable');
    }
  };

  const handleCheckOllama = async () => {
    try {
      const r = await fetch('/api/ollama/status');
      const d = await r.json();
      setOllamaStatus(d.ollama ?? 'unknown');
      setModelStatus(d.model ?? 'unknown');
      setPullProgress(d.pullProgress ?? 0);
    } catch {}
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

      {/* ── Detection Settings (REQ-FUN-610) ────────────────────────────── */}
      <div className={styles.sectionTitle}>Detection Settings</div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Second Major Detection Threshold</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          A second major is detected when a student&apos;s unit completion matches a second planner at or above this percentage.
          Default: <span style={{ fontFamily: 'var(--font-mono)' }}>70%</span>.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={threshold}
            onChange={(e) => { setThreshold(parseInt(e.target.value)); setThresholdSaved(false); }}
            style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, minWidth: 42, textAlign: 'right' }}>
            {threshold}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={styles.themeOption}
            style={{ width: 'auto', padding: '7px 14px', borderColor: thresholdSaved ? '#4ec9b0' : undefined }}
            onClick={handleSaveThreshold}
            disabled={thresholdLoading}
          >
            <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto', color: thresholdSaved ? '#4ec9b0' : undefined }}>
              {thresholdLoading ? 'Saving…' : thresholdSaved ? 'Saved ✓' : 'Save'}
            </span>
          </button>
          {threshold !== DEFAULT_THRESHOLD && (
            <button
              className={styles.themeOption}
              style={{ width: 'auto', padding: '7px 14px' }}
              onClick={() => { setThreshold(DEFAULT_THRESHOLD); setThresholdSaved(false); }}
            >
              <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto' }}>Reset to Default</span>
            </button>
          )}
        </div>
      </div>

      {/* ── AI Agent ─────────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle}>AI Agent</div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Ollama Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={dot(ollamaStatus === 'available' ? '#4ec9b0' : ollamaStatus === 'unavailable' ? '#f48771' : '#6b6b6b')} />
          <span style={statusText}>
            Ollama: {ollamaStatus === 'available' ? 'Running' : ollamaStatus === 'unavailable' ? 'Not running' : 'Unknown'}
          </span>
          <span style={{ ...statusText, marginLeft: 8 }}>
            Model: {modelStatus === 'ready' ? 'Ready' : modelStatus === 'pulling' ? `Pulling… ${pullProgress}%` : modelStatus === 'unavailable' ? 'Not downloaded' : 'Unknown'}
          </span>
          {modelStatus === 'ready' && <span style={dot('#4ec9b0')} />}
          {modelStatus === 'unavailable' && <span style={dot('#f48771')} />}
        </div>
        <button
          className={styles.themeOption}
          style={{ width: 'auto', padding: '7px 14px', marginBottom: 4 }}
          onClick={handleCheckOllama}
        >
          <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto' }}>Refresh Status</span>
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Agent Model</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Select the Ollama model for the AI advisor agent. The model must be downloaded before use.
          Recommended: <span style={{ fontFamily: 'var(--font-mono)' }}>llama3.2:3b</span> (~2 GB RAM).
        </div>
        <div style={{ marginBottom: 14 }}>
          <select
            value={agentModel}
            onChange={(e) => { setAgentModel(e.target.value as AgentModelOption); setAgentModelSaved(false); }}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'var(--surface-bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: 3,
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {AGENT_MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className={styles.themeOption}
            style={{ width: 'auto', padding: '7px 14px', borderColor: agentModelSaved ? '#4ec9b0' : undefined }}
            onClick={handleSaveAgentModel}
            disabled={agentModelLoading}
          >
            <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto', color: agentModelSaved ? '#4ec9b0' : undefined }}>
              {agentModelLoading ? 'Saving…' : agentModelSaved ? 'Saved ✓' : 'Save'}
            </span>
          </button>
          <button
            className={styles.themeOption}
            style={{ width: 'auto', padding: '7px 14px', borderColor: isPulling ? '#569cd6' : undefined, opacity: isPulling ? 0.7 : 1 }}
            onClick={handlePullModel}
            disabled={isPulling}
          >
            <span className={styles.themeOptionLabel} style={{ fontSize: 12, minWidth: 'auto', color: isPulling ? '#569cd6' : undefined }}>
              {isPulling ? `Pulling… ${pullProgress}%` : 'Download Model'}
            </span>
          </button>
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
