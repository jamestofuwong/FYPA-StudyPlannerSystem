import type { PlannerSummary } from '@student/lib/types'
import { PendingLink } from '@student/components/common/PendingNavigation'
import styles from './PlannerCard.module.css'

interface Props {
  planner: PlannerSummary
}

export default function PlannerCard({ planner }: Props) {
  const durationYears = planner.durationYears
  const courseCode = planner.courseCode?.trim() || 'No information'

  return (
    <PendingLink
      href={`/planners/${planner.id}`}
      label="Loading study planner..."
      className={styles.card}
      ariaLabel={`View ${planner.courseName}${planner.majorName ? ` ${planner.majorName}` : ''} planner`}
    >
      <div className={styles.bar}>
        <span className={styles.barCode}>{courseCode}</span>
      </div>

      <div className={styles.content}>
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.intakeBadge}>Intake: {planner.intakeLabel}</span>
          </div>
          {planner.majorName ? (
            <h2 className={styles.major}>{planner.majorName}</h2>
          ) : (
            <h2 className={styles.noMajor}>General Programme</h2>
          )}
          <p className={styles.course}>{planner.courseName}</p>
        </div>

        <div className={styles.footer}>
          <span className={styles.meta}>
            {durationYears} {durationYears === 1 ? 'yr' : 'yrs'}
            <span className={styles.metaSep}>·</span>
            {planner.totalUnits} units
          </span>
          <span className={styles.viewLink}>View planner →</span>
        </div>
      </div>
    </PendingLink>
  )
}
