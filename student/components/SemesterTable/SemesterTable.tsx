'use client'

import Link from 'next/link'
import type { SemesterBlock } from '@student/lib/types'
import styles from './SemesterTable.module.css'

interface Props {
  block: SemesterBlock
  periodLabel?: string
  completedCodes?: Set<string>
}

function rowClass(category: string, isSlot: boolean): string {
  if (isSlot) return styles.rowSlot
  switch (category) {
    case 'core':                return styles.rowCore
    case 'major_core':          return styles.rowMajor
    case 'prescribed_elective':
    case 'elective':            return styles.rowElective
    case 'wil':                 return styles.rowWil
    case 'mpu':                 return styles.rowMpu
    default:                    return ''
  }
}

export default function SemesterTable({ block, periodLabel, completedCodes }: Props) {
  const headerText = periodLabel
    ? `${block.label} - ${periodLabel}`
    : block.label

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.semesterHeaderRow}>
            <th colSpan={3}>{headerText}</th>
          </tr>
          <tr className={styles.colHeaderRow}>
            <th>Unit Code</th>
            <th>Unit Name</th>
            <th>Pre-requisites</th>
          </tr>
        </thead>
        <tbody>
          {block.units.map(unit => {
            const clickable = !unit.isElectiveSlot
            const completed = completedCodes != null && clickable && completedCodes.has(unit.code)
            const href = `/units/${unit.code}`

            return (
              <tr
                key={unit.id}
                className={[
                  styles.unitRow,
                  rowClass(unit.category, unit.isElectiveSlot),
                  clickable ? styles.clickable : '',
                  completed ? styles.rowCompleted : '',
                ].filter(Boolean).join(' ')}
              >
                <td className={`${styles.cellCode} ${unit.isElectiveSlot ? styles.cellCodeSlot : ''}`}>
                  {clickable ? (
                    <Link href={href} className={styles.unitLink} aria-label={`View ${unit.name}`}>
                      {completed && <span className={styles.completedCheck} aria-hidden="true">Completed</span>}
                      {unit.code}
                    </Link>
                  ) : (
                    '-'
                  )}
                </td>
                <td className={`${styles.cellName} ${unit.isElectiveSlot ? styles.cellNameSlot : ''}`}>
                  {clickable ? (
                    <Link href={href} className={styles.unitLink}>
                      {unit.name}
                      {unit.category === 'prescribed_elective' && (
                        <span className={styles.asterisk}>*</span>
                      )}
                    </Link>
                  ) : (
                    'Open Elective Slot'
                  )}
                </td>
                <td className={styles.cellPrereq}>
                  {clickable ? (
                    <Link href={href} className={styles.unitLink}>
                      {unit.prerequisites && unit.prerequisites.length > 0
                        ? unit.prerequisites.join(', ')
                        : 'Nil'}
                      <span className={styles.viewHint} aria-hidden="true">
                        {completed ? 'Completed' : 'View unit ->'}
                      </span>
                    </Link>
                  ) : (
                    unit.prerequisites && unit.prerequisites.length > 0
                      ? unit.prerequisites.join(', ')
                      : 'Nil'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
