import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requirePageAccess } from '@/lib/cms/access'
import { deletePlanner } from './actions'
import PlannersList from './PlannersList'
import styles from './page.module.css'

export default async function PlannersPage() {
  const { canEdit } = await requirePageAccess('planners')
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
        {canEdit && (
          <div className={styles.actions}>
            <Link href="/cms/planners/new" className={styles.btnPrimary}>
              New Planner
            </Link>
          </div>
        )}
      </div>

      <PlannersList
        planners={planners.map(planner => ({
          id: planner.id,
          courseName: planner.course.name,
          courseCode: planner.course.code,
          majorName: planner.major?.name ?? null,
          intakeYear: planner.intake_year,
          intakeMonth: planner.intake_month,
          durationSemesters: planner.duration_semesters,
        }))}
        deletePlanner={deletePlanner}
        canEdit={canEdit}
      />
    </div>
  )
}
