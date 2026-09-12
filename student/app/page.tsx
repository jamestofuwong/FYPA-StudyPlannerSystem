import { getPlanners } from '@student/lib/planners'
import Nav from '@student/components/Nav/Nav'
import PlannerGrid from '@student/components/PlannerGrid/PlannerGrid'
import styles from './page.module.css'

export default async function BrowsePage() {
  const planners = await getPlanners()

  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>Study Planners</h1>
          <p className={styles.subtitle}>
            Browse degree and diploma study plans. Click a planner to see the full semester-by-semester unit breakdown.
          </p>
        </div>
        <PlannerGrid planners={planners} />
      </main>
    </div>
  )
}
