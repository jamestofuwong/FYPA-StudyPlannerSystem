import { prisma } from '@/lib/prisma'
import PlannerForm from '../PlannerForm'

export default async function NewPlannerPage() {
  const [courses, allUnits] = await Promise.all([
    prisma.course.findMany({ include: { majors: true }, orderBy: { name: 'asc' } }),
    prisma.unit.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
  ])

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>
        New Planner
      </h1>
      <PlannerForm courses={courses} allUnits={allUnits} />
    </div>
  )
}
