import type { ReactNode } from 'react'
import styles from './forms.module.css'

/**
 * Wraps a page for an account that may only view this module. A disabled fieldset turns off every input and button
 * inside it. The real protection is on the server: every Server Action refuses a change from a view-only account.
 */
export default function ReadOnly({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>
  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <p className={styles.notice} role="status">You have view-only access to this section. You cannot make changes.</p>
      </div>
      <fieldset disabled className={styles.readOnlyFieldset}>{children}</fieldset>
    </>
  )
}
