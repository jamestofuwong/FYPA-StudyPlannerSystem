'use client';

// ============================================================
// The pieces that give the estimator its shape: numbered steps and tabs.
//
// The page used to be one card after another, all open, so finding the result meant scrolling past the
// machinery that produced it. Steps say what order things happen in and what each one is for, and a step
// that is finished folds down to one line. Tabs mean only one long list is ever on screen at a time.
// ============================================================

import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface StepProps {
  number: number;
  title: string;
  /** One plain sentence on what this step does, for someone who has not used the page before. */
  explainer: string;
  /** Shown instead of the body when the step is folded. */
  summary?: ReactNode;
  folded?: boolean;
  /** Button that unfolds a folded step, or folds an open one that can be. */
  onToggle?: () => void;
  toggleLabel?: string;
  done?: boolean;
  children?: ReactNode;
}

export function Step({ number, title, explainer, summary, folded, onToggle, toggleLabel, done, children }: StepProps) {
  return (
    <section className={`${styles.step} ${folded ? styles.stepFolded : ''}`}>
      <div className={styles.stepHead}>
        <span className={`${styles.stepNumber} ${done ? styles.stepDone : ''}`}>{done ? '✓' : number}</span>
        <div className={styles.stepTitles}>
          <h2 className={styles.stepTitle}>{title}</h2>
          {folded && summary ? <div className={styles.stepSummary}>{summary}</div> : <p className={styles.stepExplainer}>{explainer}</p>}
        </div>
        {onToggle && (
          <button type="button" className={styles.stepToggle} onClick={onToggle}>
            {toggleLabel ?? (folded ? 'Change' : 'Hide')}
          </button>
        )}
      </div>
      {!folded && children && <div className={styles.stepBody}>{children}</div>}
    </section>
  );
}

export interface TabSpec<Id extends string> {
  id: Id;
  label: string;
  count?: number;
}

export function Tabs<Id extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabSpec<Id>[];
  active: Id;
  onChange: (id: Id) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`${styles.tab} ${tab.id === active ? styles.tabActive : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className={styles.tabCount}>{tab.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

/** A headline figure: big number, short label, and an optional line saying what it means. */
export function Figure({ value, label, note, tone }: { value: ReactNode; label: string; note?: string; tone?: 'warn' | 'good' }) {
  return (
    <div className={`${styles.figure} ${tone === 'warn' ? styles.figureWarn : tone === 'good' ? styles.figureGood : ''}`}>
      <span className={styles.figureValue}>{value}</span>
      <span className={styles.figureLabel}>{label}</span>
      {note && <span className={styles.figureNote}>{note}</span>}
    </div>
  );
}
