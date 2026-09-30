import Nav from '@student/components/Nav/Nav'
import styles from './loading.module.css'

export default function UnitDetailLoading() {
  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main} aria-busy="true" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.label}>Loading unit details...</p>
      </main>
    </div>
  )
}
