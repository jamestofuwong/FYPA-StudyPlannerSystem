import type { Unit, UnitCategory } from '@student/lib/types'
import styles from './UnitRow.module.css'

const CATEGORY_LABELS: Record<UnitCategory | string, string> = {
  core:                'Core',
  major_core:          'Major',
  prescribed_elective: 'Elective',
  elective:            'Elective',
  wil:                 'WIL',
  mpu:                 'MPU',
}

const CATEGORY_CLASS: Record<UnitCategory | string, string> = {
  core:                'core',
  major_core:          'majorCore',
  prescribed_elective: 'elective',
  elective:            'elective',
  wil:                 'wil',
  mpu:                 'mpu',
}

interface Props {
  unit: Unit
}

export default function UnitRow({ unit }: Props) {
  if (unit.isElectiveSlot) {
    return (
      <div className={`${styles.row} ${styles.slot}`}>
        <span className={styles.slotCode}>—</span>
        <span className={styles.slotLabel}>Open Elective Slot</span>
        <span className={`${styles.catTag} ${styles.catSlot}`}>Elective</span>
      </div>
    )
  }

  const catClass = CATEGORY_CLASS[unit.category] ?? 'elective'

  return (
    <div className={`${styles.row} ${styles[catClass]}`}>
      <span className={styles.code}>{unit.code}</span>
      <span className={styles.name}>{unit.name}</span>
      <span className={`${styles.catTag} ${styles[`cat_${catClass}`]}`}>
        {CATEGORY_LABELS[unit.category] ?? unit.category}
      </span>
    </div>
  )
}
