import 'server-only'
import { prisma } from './prisma'
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

type UnitWithPrerequisites = {
  requisite_groups: {
    conditions: {
      requisite_type: string | null
      unit: { unit_code: string } | null
    }[]
  }[]
}

function prerequisiteCodes(unit: UnitWithPrerequisites | null | undefined): string[] {
  return unit?.requisite_groups.flatMap(group =>
    group.conditions
      .filter(condition => condition.requisite_type === 'prerequisite' && condition.unit)
      .map(condition => condition.unit!.unit_code),
  ) ?? []
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
                    where: { requisite_type: 'prerequisite' },
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
                        where: { requisite_type: 'prerequisite' },
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
        label: `Semester ${tu.semester}`,
        units: [],
      })
    }
    semesterMap.get(key)!.units.push({
      id: tu.id,
      code: tu.unit?.unit_code ?? 'ELECTIVE',
      name: tu.unit?.unit_name ?? 'Free Elective Slot',
      category: tu.category as UnitCategory,
      creditPoints: tu.unit ? Number(tu.unit.credit_points) : 12.5,
      yearLevel: tu.unit?.year_level ?? tu.year_level,
      semester: tu.semester,
      isElectiveSlot: !tu.unit,
      prerequisites: prerequisiteCodes(tu.unit),
      sourceMajorName: tu.category === 'major_core' ? t.major?.name ?? null : null,
    })
  }

  const semesters = [...semesterMap.values()].sort((a, b) => a.year - b.year || a.semester - b.semester)
  const allUnits = semesters.flatMap(s => s.units)
  const countCat = (cat: string) => {
    const n = allUnits.filter(u => u.category === cat).length
    return n > 0 ? n : null
  }

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
      core: { count: countCat('core') },
      major: { count: countCat('major_core') },
      elective: {
        count: (() => {
          const n = allUnits.filter(
            u => u.category === 'elective' || u.category === 'prescribed_elective',
          ).length
          return n > 0 ? n : null
        })(),
      },
      wil: { count: countCat('wil') },
    },
    electivePool: t.elective_groups.flatMap(group =>
      group.units.map((egu): Unit => ({
        id: egu.unit.id,
        code: egu.unit.unit_code,
        name: egu.unit.unit_name,
        category: 'elective',
        creditPoints: Number(egu.unit.credit_points),
        yearLevel: egu.unit.year_level,
        semester: 0,
        isElectiveSlot: false,
        prerequisites: prerequisiteCodes(egu.unit),
      })),
    ),
  }
}
