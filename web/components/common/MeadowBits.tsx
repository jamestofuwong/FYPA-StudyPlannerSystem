import type { ReactNode } from 'react';
import styles from './Meadow.module.css';

// Layout pieces that only the Meadow design renders. Pages keep their classic
// markup and swap these in when useDesign() === 'meadow'.

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description && <p className={styles.pageLead}>{description}</p>}
        {meta && <div className={styles.pageMeta}>{meta}</div>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

export function StateCard({
  icon,
  title,
  children,
  tone = 'neutral',
  busy = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  tone?: 'neutral' | 'error';
  busy?: boolean;
}) {
  return (
    <div className={`${styles.stateCard} ${tone === 'error' ? styles.stateError : ''}`} role={busy ? 'status' : undefined}>
      {busy ? <span className={styles.stateSpinner} aria-hidden="true" /> : icon && <span className={styles.stateIcon}>{icon}</span>}
      <div className={styles.stateTitle}>{title}</div>
      {children && <div className={styles.stateBody}>{children}</div>}
    </div>
  );
}
