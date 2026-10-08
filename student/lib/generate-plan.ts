import 'server-only'
import { buildCustomPlan } from '@core/services/scheduling/customPlannerScheduler'
import type { SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler'
import { toSchedulableUnit } from '@core/shared/scheduling/schedulableUnit'
import type { GenerationInput, GenerationResult } from './plan-builder'
import { getPlannerById } from './planners'
import { prisma } from './prisma'
import type { SemesterBlock, Unit } from './types'

// This schema records unit availability as calendar months, while the scheduler
// works in terms (1 = Semester 1, 2 = Semester 2, 3 = summer, 4 = winter).
// February is read as Semester 1 rather than summer, matching the intake rule
// below and the Semester 1 intakes stored as month 2. Months outside these
// windows leave the unit with no offering data, which the scheduler treats as
// unrestricted.
const MONTH_TO_TERM: Record<number, number> = {
  2: 1, 3: 1, 4: 1,
  8: 2, 9: 2, 10: 2,
  11: 3, 12: 3, 1: 3,
  5: 4, 6: 4, 7: 4,
}

function offeringTermsFromMonths(months: number[]): number[] {
  return months.map((month) => MONTH_TO_TERM[month]).filter((term): term is number => term !== undefined)
}

/**
 * Study years have two semesters. After N finished semesters the next slot is:
 * 0 → year 1 semester 1, 1 → year 1 semester 2, 2 → year 2 semester 1.
 * A trailing empty semester does not count; a gap still occupies its slot.
 */
function startAfterCompletedSemesters(semesters: { unitCodes: string[] }[]): { year: number; semester: 1 | 2 } {
  let lastFilled = -1
  semesters.forEach((semester, index) => {
    if (semester.unitCodes.some(code => code.trim())) lastFilled = index
  })
  const completedCount = lastFilled + 1
  return {
    year: Math.floor(completedCount / 2) + 1,
    semester: completedCount % 2 === 0 ? 1 : 2,
  }
}

async function loadPlannerTemplateForGeneration(id: string) {
  return prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      semesters: {
        orderBy: [{ year_number: 'asc' }, { sem_number: 'asc' }],
        include: {
          units: {
            orderBy: { position: 'asc' },
            include: {
              unit: {
                include: {
                  availability: true,
                  requisites: { include: { requisite_unit: { select: { code: true } } } },
                },
              },
            },
          },
        },
      },
    },
  })
}

type PlannerTemplateForGeneration = NonNullable<Awaited<ReturnType<typeof loadPlannerTemplateForGeneration>>>
type TemplateUnitForGeneration = PlannerTemplateForGeneration['semesters'][number]['units'][number]

function templateUnitToSchedulable(
  slot: TemplateUnitForGeneration,
  category: string = slot.category,
): SchedulableUnit | null {
  if (!slot.unit) return null
  return toSchedulableUnit({
    code: slot.unit.code,
    name: slot.unit.name,
    category,
    offeringTerms: offeringTermsFromMonths(slot.unit.availability.map(a => a.month)),
    requisiteGroups: [
      slot.unit.requisites.map(r => ({
        type: 'unit' as const,
        unitCode: r.requisite_unit.code,
        requisiteType: r.requisite_type,
      })),
    ],
  })
}

function templateUnitToDisplayUnit(
  slot: TemplateUnitForGeneration,
  category: string = slot.category,
  sourceMajorName?: string | null,
): Unit | null {
  if (!slot.unit) return null
  return {
    id: slot.id,
    code: slot.unit.code,
    name: slot.unit.name,
    category: category as Unit['category'],
    creditPoints: Number(slot.unit.credit_points),
    yearLevel: slot.unit.year_level ?? 1,
    semester: 0,
    isElectiveSlot: false,
    prerequisites: slot.unit.requisites
      .filter(r => r.requisite_type === 'prerequisite')
      .map(r => r.requisite_unit.code),
    sourceMajorName: sourceMajorName ?? null,
  }
}

export async function generatePlanOnServer({
  config,
  completedSemesters,
}: GenerationInput): Promise<GenerationResult | null> {
  const planner = await getPlannerById(config.plannerId)
  if (!planner) return null

  const completedCodes = new Set(
    completedSemesters.flatMap(semester => semester.unitCodes).map(c => c.trim().toUpperCase()).filter(Boolean),
  )

  // Requisites and availability are not on PlannerDetail, so read them separately
  const template = await loadPlannerTemplateForGeneration(config.plannerId)
  if (!template) return null

  const remainingUnits: SchedulableUnit[] = []
  const unitMetadataByCode = new Map<string, Unit>()
  const plannedCodes = new Set(completedCodes)

  for (const semester of template.semesters) {
    for (const slot of semester.units) {
      // An elective slot has no unit, so there is nothing to schedule or match
      if (!slot.unit) continue
      const code = slot.unit.code.trim().toUpperCase()

      // Finished units stay out of the plan. Their place in the template does
      // not decide the start year — a year-2 unit taken in the student's
      // first semester must not push the plan to year 3.
      if (completedCodes.has(code)) continue

      const schedulable = templateUnitToSchedulable(slot)
      if (schedulable) {
        remainingUnits.push(schedulable)
        plannedCodes.add(code)
      }
      const displayUnit = templateUnitToDisplayUnit(
        slot,
        slot.category,
        slot.category === 'major_core' ? planner.majorName : null,
      )
      if (displayUnit) unitMetadataByCode.set(code, displayUnit)
    }
  }

  const warnings: string[] = []
  if (config.secondMajorId) {
    const secondMajorTemplate = await prisma.plannerTemplate.findFirst({
      where: {
        course_id: template.course_id,
        major_id: config.secondMajorId,
        intake_year: config.intakeYear,
        intake_month: config.intakeMonth,
      },
      include: {
        major: true,
        semesters: {
          orderBy: [{ year_number: 'asc' }, { sem_number: 'asc' }],
          include: {
            units: {
              orderBy: { position: 'asc' },
              include: {
                unit: {
                  include: {
                    availability: true,
                    requisites: { include: { requisite_unit: { select: { code: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!secondMajorTemplate) {
      warnings.push('No Program Study Planner is available for the selected second major and intake. The generated plan uses your primary major only.')
    } else {
      for (const semester of secondMajorTemplate.semesters) {
        for (const slot of semester.units) {
          if (!slot.unit || slot.category !== 'major_core') continue
          const code = slot.unit.code.trim().toUpperCase()
          if (plannedCodes.has(code)) continue

          const schedulable = templateUnitToSchedulable(slot, 'double_major')
          if (schedulable) {
            remainingUnits.push(schedulable)
            plannedCodes.add(code)
          }
          const displayUnit = templateUnitToDisplayUnit(slot, 'double_major', secondMajorTemplate.major?.name ?? null)
          if (displayUnit) unitMetadataByCode.set(code, displayUnit)
        }
      }
    }
  }

  const start = startAfterCompletedSemesters(completedSemesters)

  // The advisor dashboard anchors on Current units before completed ones. There
  // is no enrolment status here, only completed codes, so that branch does not apply.
  const intakeSemester: 1 | 2 = config.intakeMonth >= 7 ? 2 : 1

  const result = buildCustomPlan(
    remainingUnits,
    [...completedCodes],
    start.year,
    start.semester,
    intakeSemester,
    // No grade data reaches this app, only completed codes, so no unit can be
    // known to be a Conceded Pass
    [],
  )

  for (const semester of planner.semesters) {
    for (const unit of semester.units) {
      if (!unitMetadataByCode.has(unit.code.trim().toUpperCase())) {
        unitMetadataByCode.set(unit.code.trim().toUpperCase(), unit)
      }
    }
  }
  const semesters: SemesterBlock[] = result.semesters.map(bucket => ({
    year: bucket.year,
    semester: bucket.semester,
    // The template may call this slot "Winter Term". The generated plan uses
    // the semester number the student is continuing from.
    label: `Semester ${bucket.semester}`,
    units: bucket.units.map((scheduled): Unit => {
      const plannerUnit = unitMetadataByCode.get(scheduled.code.trim().toUpperCase())
      return {
        id: plannerUnit?.id ?? scheduled.code,
        code: scheduled.code,
        name: scheduled.name,
        category: (plannerUnit?.category ?? scheduled.category) as Unit['category'],
        creditPoints: plannerUnit?.creditPoints ?? 12.5,
        yearLevel: plannerUnit?.yearLevel ?? bucket.year,
        semester: bucket.semester,
        isElectiveSlot: plannerUnit?.isElectiveSlot ?? false,
        prerequisites: plannerUnit?.prerequisites ?? [],
        sourceMajorName: plannerUnit?.sourceMajorName ?? null,
      }
    }),
  }))

  return {
    semesters,
    completedCodes,
    electivePool: planner.electivePool,
    warnings,
  }
}
