import 'server-only'
import { prisma } from './prisma'
import type { PlannerSummary, PlannerDetail, SemesterBlock, Unit, UnitCategory } from './types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export async function getPlanners(): Promise<PlannerSummary[]> {
  const templates = await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true,
      semesters: { include: { units: true } },
    },
    orderBy: [{ intake_year: 'desc' }, { intake_month: 'asc' }],
  })

  return templates.map(t => {
    const totalUnits = t.semesters.reduce((sum, s) => sum + s.units.length, 0)
    return {
      id: t.id,
      courseName: t.course.name,
      majorName: t.major?.name ?? null,
      intakeYear: t.intake_year,
      intakeMonth: t.intake_month,
      intakeLabel: `${MONTH_NAMES[t.intake_month - 1]} ${t.intake_year}`,
      durationYears: t.duration_years,
      totalUnits,
    }
  })
}

export async function getPlannerById(id: string): Promise<PlannerDetail | null> {
  const t = await prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      course: true,
      major: true,
      semesters: {
        orderBy: [{ year_number: 'asc' }, { sem_number: 'asc' }],
        include: {
          units: {
            orderBy: { position: 'asc' },
            include: { unit: true },
          },
        },
      },
      elective_pool: {
        include: { unit: true },
      },
    },
  })

  if (!t) return null

  const semesters: SemesterBlock[] = t.semesters.map(s => ({
    year: s.year_number,
    semester: s.sem_number,
    label: s.label ?? `Semester ${s.sem_number}`,
    units: s.units.map((su): Unit => ({
      id: su.id,
      code: su.unit?.code ?? 'ELECTIVE',
      name: su.unit?.name ?? 'Free Elective Slot',
      category: su.category as UnitCategory,
      creditPoints: su.unit ? Number(su.unit.credit_points) : 12.5,
      yearLevel: su.unit?.year_level ?? s.year_number,
      semester: s.sem_number,
      isElectiveSlot: su.is_elective_slot,
    })),
  }))

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
    intakeMonth: t.intake_month,
    intakeLabel: `${MONTH_NAMES[t.intake_month - 1]} ${t.intake_year}`,
    durationYears: t.duration_years,
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
    electivePool: t.elective_pool.map((ep): Unit => ({
      id: ep.unit.id,
      code: ep.unit.code,
      name: ep.unit.name,
      category: 'elective',
      creditPoints: Number(ep.unit.credit_points),
      yearLevel: ep.unit.year_level,
      semester: 0,
      isElectiveSlot: false,
    })),
  }
}
