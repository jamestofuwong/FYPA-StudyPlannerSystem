import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import PlannerForm from '../PlannerForm'

export default async function EditPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [planner, courses, allUnits] = await Promise.all([
    prisma.plannerTemplate.findUnique({
      where: { id },
      include: {
        units: {
          orderBy: [{ year_level: 'asc' }, { semester: 'asc' }, { created_at: 'asc' }],
          include: { unit: { select: { id: true, unit_code: true, unit_name: true } } },
        },
        elective_groups: {
          include: {
            units: {
              include: { unit: { select: { id: true, unit_code: true, unit_name: true } } },
            },
          },
        },
      },
    }),
    prisma.course.findMany({ include: { majors: true }, orderBy: { name: 'asc' } }),
    prisma.unit.findMany({ orderBy: { unit_code: 'asc' }, select: { id: true, unit_code: true, unit_name: true } }),
  ])

  if (!planner) notFound()

  const semesterMap = new Map<string, {
    id: string
    year_number: number
    sem_number: number
    label: string | null
    units: {
      id: string
      unit_id: string | null
      category: typeof planner.units[number]['category']
      is_elective_slot: boolean
      position: number
      unit: { id: string; code: string; name: string } | null
    }[]
  }>()

  planner.units.forEach((unit, index) => {
    const key = `${unit.year_level}-${unit.semester}`
    if (!semesterMap.has(key)) {
      semesterMap.set(key, {
        id: key,
        year_number: unit.year_level,
        sem_number: unit.semester,
        label: `Semester ${unit.semester}`,
        units: [],
      })
    }
    semesterMap.get(key)!.units.push({
      id: unit.id,
      unit_id: unit.unit_id,
      category: unit.category,
      is_elective_slot: !unit.unit_id,
      position: index + 1,
      unit: unit.unit
        ? { id: unit.unit.id, code: unit.unit.unit_code, name: unit.unit.unit_name }
        : null,
    })
  })

  const plannerForForm = {
    ...planner,
    intake_month: planner.intake_month ?? 3,
    duration_years: Math.ceil(planner.duration_semesters / 2),
    semesters: [...semesterMap.values()],
    elective_pool: planner.elective_groups.flatMap(group =>
      group.units.map(row => ({
        unit_id: row.unit_id,
        unit: { id: row.unit.id, code: row.unit.unit_code, name: row.unit.unit_name },
      })),
    ),
  }
  const unitOptions = allUnits.map(unit => ({ id: unit.id, code: unit.unit_code, name: unit.unit_name }))

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>
        Edit Planner
      </h1>
      <PlannerForm planner={plannerForForm} courses={courses} allUnits={unitOptions} />
    </div>
  )
}
