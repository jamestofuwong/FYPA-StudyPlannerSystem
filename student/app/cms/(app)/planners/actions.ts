'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PlannerSchema } from '@/lib/cms/schemas'

interface SemesterUnitInput {
  unit_id: string | null
  category: 'core' | 'major_core' | 'prescribed_elective' | 'elective' | 'wil' | 'mpu'
  is_elective_slot: boolean
  position: number
}

interface SemesterInput {
  year_number: number
  sem_number: number
  label: string
  units: SemesterUnitInput[]
}

interface PlannerFormData {
  id?: string
  course_name: string
  course_code: string | null
  major_name: string | null
  intake_month: number
  intake_year: number
  duration_years: number
  semesters: SemesterInput[]
  elective_pool: string[] // unit_ids
}

export async function savePlanner(data: PlannerFormData) {
  const parsed = PlannerSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid planner data')
  }
  const d = parsed.data

  // Resolve course — find existing by name, create if not found, then sync code
  let course = await prisma.course.findFirst({ where: { name: d.course_name } })
  if (!course) {
    course = await prisma.course.create({
      data: { name: d.course_name, code: d.course_code ?? null },
    })
  } else if (d.course_code !== undefined) {
    // Update code only when the caller explicitly provided a value (even null to clear it)
    course = await prisma.course.update({
      where: { id: course.id },
      data: { code: d.course_code },
    })
  }

  // Resolve major — find existing under this course or create
  let majorId: string | null = null
  if (d.major_name) {
    let major = await prisma.major.findFirst({
      where: { name: d.major_name, course_id: course.id },
    })
    if (!major) {
      major = await prisma.major.create({ data: { name: d.major_name, course_id: course.id } })
    }
    majorId = major.id
  }

  let plannerId = d.id

  if (plannerId) {
    // Clear semesters (cascades to semester_units) and elective pool
    await prisma.semester.deleteMany({ where: { template_id: plannerId } })
    await prisma.electivePoolUnit.deleteMany({ where: { template_id: plannerId } })

    await prisma.plannerTemplate.update({
      where: { id: plannerId },
      data: {
        course_id: course.id,
        major_id: majorId,
        intake_month: d.intake_month,
        intake_year: d.intake_year,
        duration_years: d.duration_years,
      },
    })
  } else {
    const planner = await prisma.plannerTemplate.create({
      data: {
        course_id: course.id,
        major_id: majorId,
        intake_month: d.intake_month,
        intake_year: d.intake_year,
        duration_years: d.duration_years,
      },
    })
    plannerId = planner.id
  }

  // Recreate semesters
  for (const sem of d.semesters) {
    const semester = await prisma.semester.create({
      data: { template_id: plannerId, year_number: sem.year_number, sem_number: sem.sem_number, label: sem.label },
    })
    if (sem.units.length > 0) {
      await prisma.semesterUnit.createMany({
        data: sem.units.map(u => ({
          semester_id: semester.id,
          unit_id: u.unit_id,
          category: u.category,
          is_elective_slot: u.is_elective_slot,
          position: u.position,
        })),
      })
    }
  }

  // Recreate elective pool
  if (d.elective_pool.length > 0) {
    await prisma.electivePoolUnit.createMany({
      data: d.elective_pool.map(unit_id => ({ template_id: plannerId!, unit_id })),
    })
  }

  revalidatePath('/cms/planners')
  redirect(`/cms/planners/${plannerId}`)
}

export async function deletePlanner(id: string) {
  await prisma.plannerTemplate.delete({ where: { id } })
  revalidatePath('/cms/planners')
  redirect('/cms/planners')
}
