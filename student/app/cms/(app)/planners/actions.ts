'use server'
import { revalidatePath } from 'next/cache'
import { revalidateStudentCache, STUDENT_CACHE } from '@/lib/catalog'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PlannerSchema } from '@/lib/cms/schemas'
import { requireAccess } from '@/lib/cms/access'

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
  const placedUnitIds = d.semesters.flatMap(semester =>
    semester.units.map(unit => unit.unit_id).filter((unitId): unitId is string => unitId !== null),
  )
  if (new Set(placedUnitIds).size !== placedUnitIds.length) {
    throw new Error('A unit can only appear once in a planner template.')
  }
  const session = await requireAccess('planners', 'edit')

  const plannerId = await prisma.$transaction(async tx => {
    let course = await tx.course.findFirst({ where: { name: d.course_name } })
    if (!course) {
      course = await tx.course.create({
        data: { name: d.course_name, code: d.course_code ?? null },
      })
    } else if (d.course_code !== undefined) {
      course = await tx.course.update({
        where: { id: course.id },
        data: { code: d.course_code },
      })
    }

    let majorId: string | null = null
    if (d.major_name) {
      let major = await tx.major.findFirst({
        where: { name: d.major_name, course_id: course.id },
      })
      if (!major) {
        major = await tx.major.create({ data: { name: d.major_name, course_id: course.id } })
      }
      majorId = major.id
    }

    let savedPlannerId: string
    if (d.id) {
      await tx.templateUnit.deleteMany({ where: { planner_template_id: d.id } })
      await tx.electiveGroup.deleteMany({ where: { planner_template_id: d.id } })
      await tx.plannerTemplate.update({
        where: { id: d.id },
        data: {
          course_id: course.id,
          major_id: majorId,
          intake_month: d.intake_month,
          intake_year: d.intake_year,
          duration_semesters: d.duration_years * 2,
        },
      })
      savedPlannerId = d.id
    } else {
      const planner = await tx.plannerTemplate.create({
        data: {
          course_id: course.id,
          major_id: majorId,
          intake_month: d.intake_month,
          intake_year: d.intake_year,
          duration_semesters: d.duration_years * 2,
        },
      })
      savedPlannerId = planner.id
    }

    for (const semester of d.semesters) {
      if (semester.units.length > 0) {
        await tx.templateUnit.createMany({
          data: semester.units.map(unit => ({
            planner_template_id: savedPlannerId,
            unit_id: unit.unit_id,
            category: unit.category,
            year_level: semester.year_number,
            semester: semester.sem_number,
          })),
        })
      }
    }

    if (d.elective_pool.length > 0) {
      const group = await tx.electiveGroup.create({
        data: { planner_template_id: savedPlannerId },
      })
      await tx.electiveGroupUnit.createMany({
        data: d.elective_pool.map(unit_id => ({ elective_group_id: group.id, unit_id })),
      })
    }

    return savedPlannerId
  })

  const action = data.id ? 'updated' : 'created'
  console.info(`[CMS] planner:${action} id=${plannerId} by=${session?.email ?? 'unknown'}`)

  revalidatePath('/cms/planners')
  revalidateStudentCache(STUDENT_CACHE.planners)
  redirect(`/cms/planners/${plannerId}`)
}

export async function deletePlanner(id: string) {
  const session = await requireAccess('planners', 'edit')
  try {
    await prisma.plannerTemplate.delete({ where: { id } })
  } catch (error) {
    console.error(`[CMS] planner:delete failed id=${id}`, error)
    throw new Error('Unable to delete this planner template. Please try again.')
  }
  console.info(`[CMS] planner:deleted id=${id} by=${session?.email ?? 'unknown'}`)
  revalidatePath('/cms/planners')
  revalidateStudentCache(STUDENT_CACHE.planners)
  redirect('/cms/planners')
}
