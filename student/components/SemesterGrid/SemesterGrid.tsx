import type { SemesterBlock } from '@student/lib/types'
import UnitRow from '@student/components/UnitRow/UnitRow'
import styles from './SemesterGrid.module.css'

interface Props {
  semesters: SemesterBlock[]
}

// Group SemesterBlock[] by year
function groupByYear(semesters: SemesterBlock[]): Map<number, SemesterBlock[]> {
  const map = new Map<number, SemesterBlock[]>()
  for (const block of semesters) {
    const existing = map.get(block.year) ?? []
    existing.push(block)
    map.set(block.year, existing)
  }
  return map
}

export default function SemesterGrid({ semesters }: Props) {
  const byYear = groupByYear(semesters)

  return (
    <div className={styles.root}>
      {[...byYear.entries()].map(([year, blocks]) => (
        <div key={year} className={styles.yearGroup}>
          <h2 className={styles.yearLabel}>Year {year}</h2>
          <div className={styles.semesterRow}>
            {blocks.map(block => (
              <section key={`${block.year}-${block.semester}`} className={styles.semesterBlock}>
                <div className={styles.semesterHeader}>
                  <span className={styles.semesterTitle}>{block.label}</span>
                  <span className={styles.unitCount}>{block.units.length} units</span>
                </div>
                <div className={styles.unitList}>
                  {block.units.map(unit => (
                    <UnitRow key={unit.id} unit={unit} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
