'use client';

import type { ReactNode } from 'react';
import { officialUnitUrl } from '../../../core/shared/unitLinks';
import styles from './UnitLink.module.css';

/**
 * Makes a unit code open the unit's official page on the university website. The desktop app opens it in the
 * computer's browser. A code with no official page (an MPU unit, or text that is not a unit code) is shown as it is.
 */
export default function UnitLink({ code, children }: { code: string | null | undefined; children: ReactNode }) {
  const url = officialUnitUrl(code);
  if (!url) return <>{children}</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      data-testid="unit-link"
      title="Open the official unit page"
      aria-label={`${(code ?? '').trim().toUpperCase()}, opens the official unit page`}
      // A row can have its own click action (expand, select), and the link must not trigger it
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
