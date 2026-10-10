'use client'

import type { MouseEvent } from 'react'
import type { SemesterBlock } from '@student/lib/types'
import { formatRequisiteGroups } from '@student/lib/requisites'
import { usePendingNavigation } from '@student/components/common/PendingNavigation'
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
    case 'double_major':        return styles.rowMajor
    case 'prescribed_elective':
    case 'elective':            return styles.rowElective
    case 'wil':                 return styles.rowWil
    case 'mpu':                 return styles.rowMpu
    default:                    return ''
  }
}

function majorAbbrev(name: string | null | undefined): string | null {
  if (!name) return null
  const cleaned = name.trim()
  if (!cleaned) return null
  if (/artificial intelligence/i.test(cleaned)) return 'AI'
  if (/cyber\s*security|cybersecurity/i.test(cleaned)) return 'Cybersecurity'
  const words = cleaned.match(/[A-Za-z0-9]+/g) ?? []
  if (words.length <= 1) return cleaned
  return words.map(word => word[0]).join('').toUpperCase()
}

export default function SemesterTable({ block, periodLabel, completedCodes }: Props) {
  const navigation = usePendingNavigation('Loading unit details...')
  const headerText = periodLabel
    ? `${block.label} - ${periodLabel}`
    : block.label

  function onUnitLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return
    }

    event.preventDefault()
    navigation.push(href)
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colCode} />
          <col className={styles.colName} />
          <col className={styles.colPrereq} />
        </colgroup>
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
            const pending = navigation.activePendingHref === href
            const majorTag = majorAbbrev(unit.sourceMajorName)

            return (
              <tr
                key={unit.id}
                className={[
                  styles.unitRow,
                  rowClass(unit.category, unit.isElectiveSlot),
                  clickable ? styles.clickable : '',
                  completed ? styles.rowCompleted : '',
                  pending ? styles.rowPending : '',
                ].filter(Boolean).join(' ')}
              >
                <td className={`${styles.cellCode} ${unit.isElectiveSlot ? styles.cellCodeSlot : ''}`}>
                  {clickable ? (
                    <a
                      href={href}
                      className={styles.unitLink}
                      aria-label={`View ${unit.name}`}
                      onClick={event => onUnitLinkClick(event, href)}
                    >
                      {completed && <span className={styles.completedCheck} aria-hidden="true">Completed</span>}
                      {unit.code}
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td className={`${styles.cellName} ${unit.isElectiveSlot ? styles.cellNameSlot : ''}`}>
                  {clickable ? (
                    <a href={href} className={styles.unitLink} onClick={event => onUnitLinkClick(event, href)}>
                      {unit.name}
                      {majorTag && (
                        <span className={styles.majorTag}>({majorTag})</span>
                      )}
                      {unit.category === 'prescribed_elective' && (
                        <span className={styles.asterisk}>*</span>
                      )}
                    </a>
                  ) : (
                    'Open Elective Slot'
                  )}
                </td>
                <td className={styles.cellPrereq}>
                  {clickable ? (
                    <a href={href} className={styles.unitLink} onClick={event => onUnitLinkClick(event, href)}>
                      {formatRequisiteGroups(unit.requisiteGroups) ?? unit.prerequisites?.join(', ') ?? 'Nil'}
                      <span className={styles.viewHint} aria-hidden="true">
                        {completed ? 'Completed' : 'View unit'}
                        {pending ? (
                          <span className={styles.inlineSpinner} />
                        ) : !completed ? (
                          <span>-&gt;</span>
                        ) : null}
                      </span>
                    </a>
                  ) : (
                    formatRequisiteGroups(unit.requisiteGroups) ?? unit.prerequisites?.join(', ') ?? 'Nil'
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
