import Link from 'next/link'
import type { PlannerSummary } from '@student/lib/types'
import styles from './PlannerCard.module.css'

interface Props {
  planner: PlannerSummary
}

const STOP_WORDS = new Set(['of', 'the', 'and', 'in', 'for', 'a'])

function courseAbbrev(name: string): string {
  const words = name.split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()))
  if (words.length === 0) return name.slice(0, 3).toUpperCase()
  const parts = words.map(w => w[0].toUpperCase())
  if (parts.length <= 2) {
    parts[parts.length - 1] = words[words.length - 1].slice(0, 3)
  }
  return parts.join('')
}

export default function PlannerCard({ planner }: Props) {
  const durationYears = planner.durationSemesters / 2
  const abbrev = courseAbbrev(planner.courseName)

  return (
    <Link href={`/planners/${planner.id}`} className={styles.card}>
      <div className={styles.bar}>
        <span className={styles.barCode}>{abbrev}</span>
      </div>

      <div className={styles.content}>
        <span className={styles.intake}>{planner.intakeLabel}</span>

        <div className={styles.body}>
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
    </Link>
  )
}
