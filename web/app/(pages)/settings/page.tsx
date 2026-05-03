'use client';

import styles from './page.module.css';
import { useTheme, type ThemePreference } from '../../../styles/themeProvider';

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System',  description: 'Follows your OS theme preference' },
  { value: 'light',  label: 'Light',   description: 'Always use the light theme' },
  { value: 'dark',   label: 'Dark',    description: 'Always use the dark theme' },
];

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();

  return (
    <div className={styles.panel}>
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
    </div>
  );
}
