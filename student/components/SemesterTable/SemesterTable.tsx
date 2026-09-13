'use client'

import { useRouter } from 'next/navigation'
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
  const router = useRouter()

  const headerText = periodLabel
    ? `${block.label}  ·  ${periodLabel}`
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
            const completed = completedCodes != null && !unit.isElectiveSlot && completedCodes.has(unit.code)
            return (
              <tr
                key={unit.id}
                className={[
                  styles.unitRow,
                  rowClass(unit.category, unit.isElectiveSlot),
                  clickable ? styles.clickable : '',
                  completed ? styles.rowCompleted : '',
                ].filter(Boolean).join(' ')}
                onClick={clickable ? () => router.push(`/units/${unit.code}`) : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/units/${unit.code}`) } : undefined}
                role={clickable ? 'link' : undefined}
                aria-label={clickable ? `View ${unit.name}` : undefined}
              >
                <td className={`${styles.cellCode} ${unit.isElectiveSlot ? styles.cellCodeSlot : ''}`}>
                  {completed && <span className={styles.completedCheck} aria-hidden="true">✓</span>}
                  {unit.isElectiveSlot ? '—' : unit.code}
                </td>
                <td className={`${styles.cellName} ${unit.isElectiveSlot ? styles.cellNameSlot : ''}`}>
                  {unit.isElectiveSlot ? 'Open Elective Slot' : unit.name}
                  {unit.category === 'prescribed_elective' && (
                    <span className={styles.asterisk}>*</span>
                  )}
                </td>
                <td className={styles.cellPrereq}>
                  {unit.prerequisites && unit.prerequisites.length > 0
                    ? unit.prerequisites.join(', ')
                    : 'Nil'}
                  {clickable && (
                    <span className={styles.viewHint} aria-hidden="true">
                      {completed ? 'Completed ✓' : 'View unit →'}
                    </span>
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
