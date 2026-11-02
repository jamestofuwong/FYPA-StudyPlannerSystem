import Nav from '@student/components/Nav/Nav'
import styles from './loading.module.css'

export default function PlannerDetailLoading() {
  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main} aria-busy="true" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.label}>Loading study planner...</p>
      </main>
    </div>
  )
}
