import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import styles from './page.module.css'

async function deleteUnit(id: string) {
  'use server'
  await prisma.unit.delete({ where: { id } })
  revalidatePath('/cms/units')
}

export default async function UnitsPage() {
  const units = await prisma.unit.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, year_level: true, credit_points: true },
  })

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Units</h1>
          <p className={styles.subheading}>{units.length} unit{units.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/cms/units/new" className={styles.btnPrimary}>+ New Unit</Link>
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Code</th>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Year</th>
            <th className={styles.th}>Credit Points</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {units.map(unit => (
            <tr key={unit.id} className={styles.tr}>
              <td className={`${styles.td} ${styles.codeCell}`}>{unit.code}</td>
              <td className={styles.td}>{unit.name}</td>
              <td className={styles.td}>Year {unit.year_level}</td>
              <td className={styles.td}>{String(unit.credit_points)}</td>
              <td className={styles.td}>
                <div className={styles.rowActions}>
                  <Link href={`/cms/units/${unit.id}`} className={styles.btnSecondary}>Edit</Link>
                  <form action={deleteUnit.bind(null, unit.id)}>
                    <button type="submit" className={styles.btnDanger}>Delete</button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
          {units.length === 0 && (
            <tr>
              <td className={styles.td} colSpan={5} style={{ textAlign: 'center', color: '#6b7280' }}>
                No units yet. <Link href="/cms/units/new">Add the first one.</Link>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
