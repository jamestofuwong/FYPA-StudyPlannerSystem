import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requirePageAccess } from '@/lib/cms/access'
import { deleteUnit } from './actions'
import UnitsList from './UnitsList'
import styles from './page.module.css'

export default async function UnitsPage() {
  const { canEdit } = await requirePageAccess('units')
  const units = await prisma.unit.findMany({
    orderBy: { unit_code: 'asc' },
    select: { id: true, unit_code: true, unit_name: true, year_level: true, credit_points: true },
  })

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Units</h1>
          <p className={styles.subheading}>{units.length} unit{units.length !== 1 ? 's' : ''}</p>
        </div>
        {canEdit && (
          <div className={styles.actions}>
            <Link href="/cms/units/new" className={styles.btnPrimary}>+ New Unit</Link>
          </div>
        )}
      </div>

      <UnitsList
        units={units.map(unit => ({ ...unit, credit_points: String(unit.credit_points) }))}
        deleteUnit={deleteUnit}
        canEdit={canEdit}
      />
    </div>
  )
}
