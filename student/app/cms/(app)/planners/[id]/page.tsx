import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import PlannerForm from '../PlannerForm'

export default async function EditPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [planner, courses, allUnits] = await Promise.all([
    prisma.plannerTemplate.findUnique({
      where: { id },
      include: {
        semesters: {
          orderBy: [{ year_number: 'asc' }, { sem_number: 'asc' }],
          include: {
            units: {
              orderBy: { position: 'asc' },
              include: { unit: { select: { id: true, code: true, name: true } } },
            },
          },
        },
        elective_pool: {
          include: { unit: { select: { id: true, code: true, name: true } } },
        },
      },
    }),
    prisma.course.findMany({ include: { majors: true }, orderBy: { name: 'asc' } }),
    prisma.unit.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
  ])

  if (!planner) notFound()

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>
        Edit Planner
      </h1>
      <PlannerForm planner={planner} courses={courses} allUnits={allUnits} />
    </div>
  )
}
