'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';
import { useTheme, type DesignMode, type ThemePreference } from '../../../styles/themeProvider';
import { fs, radius } from '../../../styles/tokens';
import { PageHeader } from '../../../components/common/MeadowBits';
import HueWheel from '../../../components/common/HueWheel';
import type { MeadowAccent } from '../../../styles/meadowHue';
import { accentPalette } from '../../../styles/meadowHue';
import { Check, Monitor, Moon, Palette, RefreshCw, ScanSearch, Sun } from 'lucide-react';

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System',          description: 'Follows your OS theme preference' },
  { value: 'light',  label: 'Light',           description: 'Always use the light theme' },
  { value: 'dark',   label: 'Dark',            description: 'Always use the dark theme' },
  { value: 'portal', label: 'Original Portal', description: 'Matches the student portal — dark sidebar, white content, steel blue accents' },
];

const DESIGN_OPTIONS: { value: DesignMode; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: 'The original compact layout, styled like a code editor' },
  { value: 'meadow',  label: 'Easy',    description: 'Calm and roomy: larger text, softer colours, grouped navigation' },
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

const MODE_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Meadow: one line saying where the updater is, and how it should read. */
function describeUpdate(update: UpdateStatus): { text: string; tone: 'muted' | 'busy' | 'good' | 'bad' } {
  switch (update.status) {
    case 'idle': return { text: 'Not checked yet', tone: 'muted' };
    case 'checking': return { text: 'Checking for updates…', tone: 'busy' };
    case 'not-available': return { text: "You're on the latest version.", tone: 'good' };
    case 'available': return { text: `Version v${update.version} is available`, tone: 'busy' };
    case 'downloading': return { text: `Downloading… ${update.percent}%`, tone: 'busy' };
    case 'downloaded': return { text: `Version v${update.version} downloaded and ready to install`, tone: 'good' };
    case 'error': return { text: `Error: ${update.message}`, tone: 'bad' };
  }
}

export default function SettingsPage() {
  const { preference, setPreference, design, setDesign, meadowHue, setMeadowHue, meadowShade, setMeadowShade, meadowAccent, theme } = useTheme();
  // The portal colour mode only exists in the classic design.
  const themeOptions = design === 'meadow' ? THEME_OPTIONS.filter((o) => o.value !== 'portal') : THEME_OPTIONS;
  const [update, setUpdate] = useState<UpdateStatus>({ status: 'idle' });
  const appVersion = process.env.APP_VERSION ?? '—';

  // REQ-FUN-610: second major detection threshold
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [thresholdLoading, setThresholdLoading] = useState(false);

  // Load stored threshold on mount
  useEffect(() => {
    fetch('/api/config?key=second_major_threshold')
      .then((r) => r.json())
      .then((d) => { if (d.value !== null) setThreshold(Math.round(parseFloat(d.value) * 100)); })
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

  const designTiles = DESIGN_OPTIONS.map((opt) => {
    const active = design === opt.value;
    return (
      <button
        key={opt.value}
        className={`${styles.designOption} ${active ? styles.themeOptionActive : ''}`}
        onClick={() => setDesign(opt.value)}
        aria-pressed={active}
      >
        <DesignPreview design={opt.value} accent={meadowAccent} />
        <span className={styles.designOptionHead}>
          <span className={styles.themeOptionLabel}>{opt.label}</span>
          {active && <span className={styles.themeOptionCheck}>✓</span>}
        </span>
        <span className={styles.themeOptionDesc}>{opt.description}</span>
      </button>
    );
  });

  if (design === 'meadow') {
    const updateLine = describeUpdate(update);
    return (
      <div className={styles.panel}>
        <PageHeader title="Settings" description="Appearance, major detection and updates for this computer." />

        <section className={styles.mSection}>
          <h2 className={styles.mSectionTitle}><Palette aria-hidden="true" />Appearance</h2>
          <div className={styles.mGroup}>
            <div className={styles.mRow}>
              <div className={styles.mRowText}>
                <div className={styles.mRowLabel}>Design</div>
                <div className={styles.mRowDesc}>Changes the colours, fonts and layout. Every page works the same in both designs.</div>
              </div>
              <div className={`${styles.mRowControl} ${styles.designOptions}`}>{designTiles}</div>
            </div>
            <div className={styles.mRow}>
              <div className={styles.mRowText}>
                <div className={styles.mRowLabel}>Colour mode</div>
                <div className={styles.mRowDesc}>
                  {preference === 'portal'
                    ? 'Original Portal is a Classic theme, so Easy is using its light colours.'
                    : 'Light, dark, or follow your computer.'}
                </div>
              </div>
              <div className={styles.mRowControl}>
                <div className={styles.mModes}>
                  {themeOptions.map((opt) => {
                    const active = preference === opt.value;
                    const Icon = MODE_ICONS[opt.value as keyof typeof MODE_ICONS] ?? Monitor;
                    return (
                      <button
                        key={opt.value}
                        className={`${styles.mMode} ${active ? styles.mModeActive : ''}`}
                        onClick={() => setPreference(opt.value)}
                        aria-pressed={active}
                        title={opt.description}
                      >
                        <Icon aria-hidden="true" />
                        <span className={styles.mModeLabel}>{opt.label}</span>
                        <span className={styles.mModeDesc}>{opt.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className={styles.mRow}>
              <div className={styles.mRowText}>
                <div className={styles.mRowLabel}>Accent colour</div>
                <div className={styles.mRowDesc}>
                  Pick a colour, or a shade of grey, black or white, to tint all of Easy: buttons, highlights,
                  backgrounds and borders. The tones are adjusted so text stays easy to read, in light and dark.
                </div>
              </div>
              <div className={styles.mRowControl}>
                <HueWheel
                  hue={meadowHue}
                  onChange={(h) => setMeadowHue(h)}
                  shade={meadowShade}
                  onShade={(sh) => setMeadowShade(sh)}
                  onReset={() => setMeadowHue(null)}
                  accent={theme.activeHighlight}
                />
              </div>
            </div>
          </div>
        </section>

        {/* REQ-FUN-610 */}
        <section className={styles.mSection}>
          <h2 className={styles.mSectionTitle}><ScanSearch aria-hidden="true" />Major detection</h2>
          <div className={styles.mGroup}>
            <div className={styles.mRow}>
              <div className={styles.mRowText}>
                <div className={styles.mRowLabel}>Second major threshold</div>
                <div className={styles.mRowDesc}>
                  A second major is detected when a student&apos;s unit completion matches a second planner at or above
                  this percentage. Default: 70%.
                </div>
              </div>
              <div className={styles.mRowControl}>
                <div className={styles.mSliderRow}>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={threshold}
                    onChange={(e) => { setThreshold(parseInt(e.target.value)); setThresholdSaved(false); }}
                    className={styles.mSlider}
                    aria-label="Second major threshold"
                  />
                  <span className={styles.mSliderValue}>{threshold}%</span>
                </div>
                <div className={styles.mActions}>
                  <button className={styles.mBtnPrimary} onClick={handleSaveThreshold} disabled={thresholdLoading}>
                    {thresholdSaved && <Check aria-hidden="true" />}
                    {thresholdLoading ? 'Saving…' : thresholdSaved ? 'Saved' : 'Save'}
                  </button>
                  {threshold !== DEFAULT_THRESHOLD && (
                    <button className={styles.mBtn} onClick={() => { setThreshold(DEFAULT_THRESHOLD); setThresholdSaved(false); }}>
                      Reset to default
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.mSection}>
          <h2 className={styles.mSectionTitle}><RefreshCw aria-hidden="true" />Updates</h2>
          <div className={styles.mGroup}>
            <div className={styles.mRow}>
              <div className={styles.mRowText}>
                <div className={styles.mRowLabel}>Application update</div>
                <div className={styles.mRowDesc}>Current version: v{appVersion}</div>
              </div>
              <div className={styles.mRowControl}>
                <div className={`${styles.mUpdateLine} ${styles[`mTone_${updateLine.tone}`]}`}>
                  <span className={styles.mUpdateDot} />
                  {updateLine.text}
                </div>
                {update.status === 'downloading' && (
                  <div className={styles.mUpdateTrack}><div style={{ width: `${update.percent}%` }} /></div>
                )}
                <div className={styles.mActions}>
                  {(update.status === 'idle' || update.status === 'not-available' || update.status === 'error') && (
                    <button className={styles.mBtn} onClick={handleCheck}>Check for updates</button>
                  )}
                  {update.status === 'available' && (
                    <button className={styles.mBtnPrimary} onClick={() => (window as any).updaterAPI?.download()}>Download v{update.version}</button>
                  )}
                  {update.status === 'downloaded' && (
                    <button className={styles.mBtnPrimary} onClick={() => (window as any).updaterAPI?.install()}>Restart &amp; install</button>
                  )}
                  {update.status === 'checking' && <button className={styles.mBtn} disabled>Checking…</button>}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.panel}>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle}>Appearance</div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Design</div>
        <div className={styles.cardDesc}>Changes the colours, fonts and layout. Every page works the same in both designs.</div>
        <div className={styles.designOptions}>
          {designTiles}
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Theme</div>
        <div className={styles.themeOptions}>
          {themeOptions.map((opt) => {
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
        <div style={{ fontSize: fs(12), color: 'var(--text-muted)', marginBottom: 14 }}>
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: fs(14), fontWeight: 600, minWidth: 42, textAlign: 'right' }}>
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
            <span className={styles.themeOptionLabel} style={{ fontSize: fs(12), minWidth: 'auto', color: thresholdSaved ? '#4ec9b0' : undefined }}>
              {thresholdLoading ? 'Saving…' : thresholdSaved ? 'Saved ✓' : 'Save'}
            </span>
          </button>
          {threshold !== DEFAULT_THRESHOLD && (
            <button
              className={styles.themeOption}
              style={{ width: 'auto', padding: '7px 14px' }}
              onClick={() => { setThreshold(DEFAULT_THRESHOLD); setThresholdSaved(false); }}
            >
              <span className={styles.themeOptionLabel} style={{ fontSize: fs(12), minWidth: 'auto' }}>Reset to Default</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Updates ──────────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle}>Updates</div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Application Update</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: fs(12), color: 'var(--text-muted)' }}>
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
            <div style={{ width: '100%', height: 4, background: 'var(--panel-border)', borderRadius: radius(2), overflow: 'hidden' }}>
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
              <span className={styles.themeOptionLabel} style={{ fontSize: fs(12), minWidth: 'auto' }}>Check for Updates</span>
            </button>
          )}
          {update.status === 'available' && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px', borderColor: '#569cd6' }} onClick={() => (window as any).updaterAPI?.download()}>
              <span className={styles.themeOptionLabel} style={{ fontSize: fs(12), minWidth: 'auto', color: '#569cd6' }}>Download v{update.version}</span>
            </button>
          )}
          {update.status === 'downloaded' && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px', borderColor: '#4ec9b0' }} onClick={() => (window as any).updaterAPI?.install()}>
              <span className={styles.themeOptionLabel} style={{ fontSize: fs(12), minWidth: 'auto', color: '#4ec9b0' }}>Restart & Install</span>
            </button>
          )}
          {update.status === 'checking' && (
            <button className={styles.themeOption} style={{ width: 'auto', padding: '7px 14px', opacity: 0.5 }} disabled>
              <span className={styles.themeOptionLabel} style={{ fontSize: fs(12), minWidth: 'auto' }}>Checking…</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

// Miniature of each design, drawn in that design's own colours so the choice
// is visible whichever design is active.
function DesignPreview({ design, accent }: { design: DesignMode; accent: MeadowAccent }) {
  const m = accentPalette('light', accent);
  const c = design === 'meadow'
    ? { ground: m.mainBg, side: m.sidebarBg, line: m.panelBorder, accent: m.activeHighlight, wash: m.activeBg, ink: m.textPrimary, card: m.cardBg, radius: 6 }
    : { ground: '#252526', side: '#1e1e1e', line: '#3e3e42', accent: '#007acc', wash: 'rgba(0, 122, 204, 0.25)', ink: '#cccccc', card: '#333337', radius: 1 };
  return (
    <span className={styles.designPreview} style={{ background: c.ground, borderColor: c.line }} aria-hidden="true">
      <span className={styles.previewSide} style={{ background: c.side, borderColor: c.line }}>
        <span className={styles.previewNav} style={{ background: c.wash, borderRadius: c.radius }} />
        <span className={styles.previewLine} style={{ background: c.line }} />
        <span className={styles.previewLine} style={{ background: c.line }} />
      </span>
      <span className={styles.previewMain}>
        <span className={styles.previewTitle} style={{ background: c.ink, borderRadius: c.radius }} />
        <span className={styles.previewCard} style={{ background: c.card, borderColor: c.line, borderRadius: c.radius * 2 }}>
          <span className={styles.previewBar} style={{ background: c.accent, borderRadius: c.radius }} />
        </span>
      </span>
    </span>
  );
}

const statusRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const statusText: React.CSSProperties = {
  fontSize: fs(12), color: 'var(--text-muted)',
};

const dot = (color: string): React.CSSProperties => ({
  width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
});
