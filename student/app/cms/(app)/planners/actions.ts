'use server'
import { revalidatePath } from 'next/cache'
import { revalidateStudentCache, STUDENT_CACHE } from '@/lib/catalog'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PlannerSchema } from '@/lib/cms/schemas'
import { getSession } from '@/lib/cms/session'

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
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid planner data')
  }
  const d = parsed.data
  const session = await getSession()

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
    await prisma.templateUnit.deleteMany({ where: { planner_template_id: plannerId } })
    await prisma.electiveGroup.deleteMany({ where: { planner_template_id: plannerId } })

    await prisma.plannerTemplate.update({
      where: { id: plannerId },
      data: {
        course_id: course.id,
        major_id: majorId,
        intake_month: d.intake_month,
        intake_year: d.intake_year,
        duration_semesters: d.duration_years * 2,
      },
    })
  } else {
    const planner = await prisma.plannerTemplate.create({
      data: {
        course_id: course.id,
        major_id: majorId,
        intake_month: d.intake_month,
        intake_year: d.intake_year,
        duration_semesters: d.duration_years * 2,
      },
    })
    plannerId = planner.id
  }

  // Recreate planner unit placements in the same shape as the main app.
  for (const sem of d.semesters) {
    if (sem.units.length > 0) {
      await prisma.templateUnit.createMany({
        data: sem.units.map(u => ({
          planner_template_id: plannerId!,
          unit_id: u.unit_id,
          category: u.category,
          year_level: sem.year_number,
          semester: sem.sem_number,
        })),
      })
    }
  }

  if (d.elective_pool.length > 0) {
    const group = await prisma.electiveGroup.create({
      data: { planner_template_id: plannerId! },
    })
    await prisma.electiveGroupUnit.createMany({
      data: d.elective_pool.map(unit_id => ({ elective_group_id: group.id, unit_id })),
    })
  }

  const action = data.id ? 'updated' : 'created'
  console.info(`[CMS] planner:${action} id=${plannerId} by=${session?.email ?? 'unknown'}`)

  revalidatePath('/cms/planners')
  revalidateStudentCache(STUDENT_CACHE.planners)
  redirect(`/cms/planners/${plannerId}`)
}

export async function deletePlanner(id: string) {
  const session = await getSession()
  await prisma.plannerTemplate.delete({ where: { id } })
  console.info(`[CMS] planner:deleted id=${id} by=${session?.email ?? 'unknown'}`)
  revalidatePath('/cms/planners')
  revalidateStudentCache(STUDENT_CACHE.planners)
  redirect('/cms/planners')
}
