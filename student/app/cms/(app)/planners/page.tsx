import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import styles from './page.module.css'

async function deletePlanner(id: string) {
  'use server'
  await prisma.plannerTemplate.delete({ where: { id } })
  revalidatePath('/cms/planners')
}

const MONTH_NAMES: Record<number, string> = {
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
}

export default async function PlannersPage() {
  const planners = await prisma.plannerTemplate.findMany({
    include: { course: true, major: true },
    orderBy: [{ intake_year: 'desc' }, { intake_month: 'asc' }],
  })

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Planner Templates</h1>
          <p className={styles.subheading}>
            {planners.length} planner template{planners.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/cms/planners/new" className={styles.btnPrimary}>
            New Planner
          </Link>
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Course</th>
            <th className={styles.th}>Major</th>
            <th className={styles.th}>Intake</th>
            <th className={styles.th}>Duration</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {planners.map(planner => (
            <tr key={planner.id} className={styles.tr}>
              <td className={styles.td}>{planner.course.name}</td>
              <td className={styles.td}>{planner.major?.name ?? '—'}</td>
              <td className={styles.td}>
                {MONTH_NAMES[planner.intake_month] ?? `Month ${planner.intake_month}`} {planner.intake_year}
              </td>
              <td className={styles.td}>{planner.duration_years} years</td>
              <td className={styles.td}>
                <div className={styles.rowActions}>
                  <Link href={`/cms/planners/${planner.id}`} className={styles.btnSecondary}>Edit</Link>
                  <form action={deletePlanner.bind(null, planner.id)}>
                    <button type="submit" className={styles.btnDanger}>Delete</button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
          {planners.length === 0 && (
            <tr>
              <td className={styles.td} colSpan={5} style={{ textAlign: 'center', color: '#6b7280' }}>
                No planner templates found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
