import type { SemesterBlock } from '@student/lib/types'
import styles from './CategoryLegend.module.css'

const ITEMS = [
  { id: 'core', label: 'Core', swatch: 'core' },
  { id: 'major_core', label: 'Major', swatch: 'major' },
  { id: 'elective', label: 'Elective', swatch: 'elective' },
  { id: 'prescribed_elective', label: 'Prescribed elective', swatch: 'elective' },
  { id: 'wil', label: 'WIL', swatch: 'wil' },
  { id: 'mpu', label: 'MPU', swatch: 'mpu' },
  { id: 'slot', label: 'Open elective slot', swatch: 'slot' },
] as const

export function categoriesInPlan(semesters: SemesterBlock[]): string[] {
  return semesters.flatMap(block =>
    block.units.map(unit => (unit.isElectiveSlot ? 'slot' : unit.category)),
  )
}

export default function CategoryLegend({
  categories,
  variant = 'inline',
}: {
  categories: Iterable<string>
  variant?: 'inline' | 'sidebar'
}) {
  const present = new Set(categories)
  const items = ITEMS.filter(item => present.has(item.id))
  if (items.length === 0) return null

  return (
    <div className={variant === 'sidebar' ? styles.sidebar : styles.wrap}>
      <ul className={styles.legend} aria-label="Unit categories">
        {items.map(item => (
          <li key={item.id} className={styles.item}>
            <span className={`${styles.swatch} ${styles[item.swatch]}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
