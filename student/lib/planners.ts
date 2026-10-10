import 'server-only'
import { prisma } from './prisma'
import { requisiteUnitCodes, toRequisiteGroups } from './requisites'
import { termLabel } from './term-labels'
import type { PlannerDetail, PlannerSummary, SemesterBlock, Unit, UnitCategory } from './types'

export interface PlannerMajorOption {
  majorId: string | null
  majorName: string | null
  plannerId: string
}

export interface PlannerSecondMajorOption {
  majorId: string
  majorName: string
}

export interface PlannerCourseOption {
  courseId: string
  courseName: string
  majors: PlannerMajorOption[]
  secondMajors: PlannerSecondMajorOption[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function unitRequisites(unit: { requisite_groups: Parameters<typeof toRequisiteGroups>[0] } | null | undefined) {
  return toRequisiteGroups(unit?.requisite_groups ?? [])
}

function intakeLabel(month: number | null, year: number): string {
  return month ? `${MONTH_NAMES[month - 1] ?? `Month ${month}`} ${year}` : `${year}`
}

export async function getPlannerOptions(): Promise<PlannerCourseOption[]> {
  const templates = await prisma.plannerTemplate.findMany({
    include: {
      course: {
        include: { majors: { orderBy: { name: 'asc' } } },
      },
      major: true,
    },
    orderBy: { intake_year: 'desc' },
  })

  const courseMap = new Map<string, PlannerCourseOption>()
  const seen = new Set<string>()

  for (const t of templates) {
    const comboKey = `${t.course_id}-${t.major_id ?? 'null'}`
    if (seen.has(comboKey)) continue
    seen.add(comboKey)

    if (!courseMap.has(t.course_id)) {
      courseMap.set(t.course_id, {
        courseId: t.course_id,
        courseName: t.course.name,
        majors: [],
        secondMajors: t.course.majors.map(major => ({
          majorId: major.id,
          majorName: major.name,
        })),
      })
    }
    courseMap.get(t.course_id)!.majors.push({
      majorId: t.major_id ?? null,
      majorName: t.major?.name ?? null,
      plannerId: t.id,
    })
  }

  return [...courseMap.values()]
}

export async function getPlanners(): Promise<PlannerSummary[]> {
  const templates = await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true,
      _count: { select: { units: true } },
    },
    orderBy: [{ intake_year: 'desc' }, { intake_month: 'asc' }],
  })

  return templates.map(t => ({
    id: t.id,
    courseName: t.course.name,
    majorName: t.major?.name ?? null,
    intakeYear: t.intake_year,
    intakeMonth: t.intake_month ?? 0,
    intakeLabel: intakeLabel(t.intake_month, t.intake_year),
    durationYears: Math.ceil(t.duration_semesters / 2),
    totalUnits: t._count.units,
  }))
}

export async function getPlannerById(id: string): Promise<PlannerDetail | null> {
  const t = await prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      course: true,
      major: true,
      units: {
        orderBy: [{ year_level: 'asc' }, { semester: 'asc' }, { created_at: 'asc' }],
        include: {
          unit: {
            include: {
              requisite_groups: {
                include: {
                  conditions: {
                    include: { unit: { select: { unit_code: true } } },
                  },
                },
              },
            },
          },
        },
      },
      elective_groups: {
        include: {
          units: {
            include: {
              unit: {
                include: {
                  requisite_groups: {
                    include: {
                      conditions: {
                        include: { unit: { select: { unit_code: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!t) return null

  const semesterMap = new Map<string, SemesterBlock>()
  for (const tu of t.units) {
    const key = `${tu.year_level}-${tu.semester}`
    if (!semesterMap.has(key)) {
      semesterMap.set(key, {
        year: tu.year_level,
        semester: tu.semester,
        label: termLabel(tu.semester),
        units: [],
      })
    }
    const requisiteGroups = unitRequisites(tu.unit)
    semesterMap.get(key)!.units.push({
      id: tu.id,
      code: tu.unit?.unit_code ?? 'ELECTIVE',
      name: tu.unit?.unit_name ?? 'Free Elective Slot',
      category: tu.category as UnitCategory,
      creditPoints: tu.unit ? Number(tu.unit.credit_points) : 12.5,
      yearLevel: tu.unit?.year_level ?? tu.year_level,
      semester: tu.semester,
      isElectiveSlot: !tu.unit,
      requisiteGroups,
      prerequisites: requisiteUnitCodes(requisiteGroups, 'prerequisite'),
      sourceMajorName: tu.category === 'major_core' ? t.major?.name ?? null : null,
    })
  }

  const semesters = [...semesterMap.values()].sort((a, b) => a.year - b.year || a.semester - b.semester)
  const allUnits = semesters.flatMap(s => s.units)
  return {
    id: t.id,
    courseName: t.course.name,
    majorName: t.major?.name ?? null,
    intakeYear: t.intake_year,
    intakeMonth: t.intake_month ?? 0,
    intakeLabel: intakeLabel(t.intake_month, t.intake_year),
    durationYears: Math.ceil(t.duration_semesters / 2),
    totalUnits: allUnits.length,
    semesters,
    requirements: {
      core: { count: t.core_count, creditPoints: t.core_cp },
      major: { count: t.major_count, creditPoints: t.major_cp },
      elective: { count: t.elective_count, creditPoints: t.elective_cp },
      wil: { count: t.wil_count, creditPoints: t.wil_cp },
    },
    electivePool: t.elective_groups.flatMap(group =>
      group.units.map((egu): Unit => {
        const requisiteGroups = unitRequisites(egu.unit)
        return {
          id: egu.unit.id,
          code: egu.unit.unit_code,
          name: egu.unit.unit_name,
          category: 'elective',
          creditPoints: Number(egu.unit.credit_points),
          yearLevel: egu.unit.year_level,
          semester: 0,
          isElectiveSlot: false,
          requisiteGroups,
          prerequisites: requisiteUnitCodes(requisiteGroups, 'prerequisite'),
        }
      }),
    ),
  }
}
