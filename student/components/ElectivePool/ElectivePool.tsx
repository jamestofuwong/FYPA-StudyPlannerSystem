'use client'

import type { Unit } from '@student/lib/types'
import { formatRequisiteGroups } from '@student/lib/requisites'
import { usePendingNavigation } from '@student/components/common/PendingNavigation'
import styles from './ElectivePool.module.css'

interface Props {
  units: Unit[]
}

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function groupByMonth(units: Unit[]): { month: string; units: Unit[] }[] {
  const monthMap = new Map<string, Unit[]>()
  for (const unit of units) {
    for (const month of unit.availability ?? []) {
      const arr = monthMap.get(month) ?? []
      arr.push(unit)
      monthMap.set(month, arr)
    }
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))
    .map(([month, units]) => ({ month, units }))
}

function UnitRow({ unit, onClick, pending }: { unit: Unit; onClick: () => void; pending: boolean }) {
  return (
    <div
      className={`${styles.unitRow} ${pending ? styles.unitRowPending : ''}`}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      role="link"
      aria-label={`View ${unit.name}`}
    >
      <span className={styles.cellCode}>{unit.code}</span>
      <span className={styles.cellName}>{unit.name}</span>
      <span className={styles.cellPrereq}>
        {formatRequisiteGroups(unit.requisiteGroups) ?? unit.prerequisites?.join(', ') ?? 'Nil'}
        <span className={styles.viewHint} aria-hidden="true">
          View unit
          {pending ? <span className={styles.inlineSpinner} /> : <span>→</span>}
        </span>
      </span>
    </div>
  )
}

export default function ElectivePool({ units }: Props) {
  const navigation = usePendingNavigation('Loading unit details...')

  if (units.length === 0) return null

  const groups = groupByMonth(units)

  if (groups.length === 0) {
    return (
      <div className={styles.poolTable}>
        <div className={styles.colHeaders}>
          <span>Unit Code</span>
          <span>Unit Name</span>
          <span>Pre-requisites</span>
        </div>
        {units.map(unit => (
          <UnitRow
            key={unit.id}
            unit={unit}
            pending={navigation.activePendingHref === `/units/${unit.code}`}
            onClick={() => navigation.push(`/units/${unit.code}`)}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      {groups.map(({ month, units: monthUnits }) => (
        <div key={month} className={styles.group}>
          <h4 className={styles.monthHeading}>{month}</h4>
          <div className={styles.poolTable}>
            <div className={styles.colHeaders}>
              <span>Unit Code</span>
              <span>Unit Name</span>
              <span>Pre-requisites</span>
            </div>
            {monthUnits.map(unit => (
              <UnitRow
                key={unit.id}
                unit={unit}
                pending={navigation.activePendingHref === `/units/${unit.code}`}
                onClick={() => navigation.push(`/units/${unit.code}`)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
