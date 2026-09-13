import Nav from '@student/components/Nav/Nav'
import PlanBuilderClient from './PlanBuilderClient'
import styles from './page.module.css'

export default function PlanBuilderPage() {
  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Plan Builder</h1>
          <p className={styles.heroSubtitle}>
            Customise your study plan based on your course, major, intake year, and units already completed.
          </p>
        </div>
        <PlanBuilderClient />
      </main>
    </div>
  )
}
