import Nav from '@student/components/Nav/Nav'
import { getCachedPlannerOptions, getCachedUnits } from '@student/lib/catalog'
import PlanBuilderClient from './PlanBuilderClient'
import styles from './page.module.css'

export default async function PlanBuilderPage() {
  const [plannerOptions, units] = await Promise.all([
    getCachedPlannerOptions(),
    getCachedUnits(),
  ])

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
        <PlanBuilderClient plannerOptions={plannerOptions} units={units} />
      </main>
    </div>
  )
}
