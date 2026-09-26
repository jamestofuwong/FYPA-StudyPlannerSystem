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

/** Next planner slot after the given one. Slots are intake-relative, not calendar terms. */
function nextSlot(year: number, semester: number): { year: number; semester: 1 | 2 } {
  return semester === 1 ? { year, semester: 2 } : { year: year + 1, semester: 1 }
}

export async function generatePlanOnServer({
  config,
  completedUnitCodes,
}: GenerationInput): Promise<GenerationResult | null> {
  const planner = await getPlannerById(config.plannerId)
  if (!planner) return null

  const completedCodes = new Set(completedUnitCodes.map(c => c.trim().toUpperCase()))

  // Requisites and availability are not on PlannerDetail, so read them separately
  const template = await prisma.plannerTemplate.findUnique({
    where: { id: config.plannerId },
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
  if (!template) return null

  const remainingUnits: SchedulableUnit[] = []
  let lastCompletedSlot: { year: number; semester: number } | null = null

  for (const semester of template.semesters) {
    for (const slot of semester.units) {
      // An elective slot has no unit, so there is nothing to schedule or match
      if (!slot.unit) continue
      const code = slot.unit.code.trim().toUpperCase()

      if (completedCodes.has(code)) {
        lastCompletedSlot = { year: semester.year_number, semester: semester.sem_number }
        continue
      }

      remainingUnits.push(
        toSchedulableUnit({
          code: slot.unit.code,
          name: slot.unit.name,
          category: slot.category,
          offeringTerms: offeringTermsFromMonths(slot.unit.availability.map(a => a.month)),
          // This schema stores one flat requisite list with no alternatives, so
          // every requisite goes in a single AND group. That under-schedules a
          // unit whose real rule is "A or B", which is safer than suggesting a
          // unit the student cannot enrol in.
          requisiteGroups: [
            slot.unit.requisites.map(r => ({
              type: 'unit' as const,
              unitCode: r.requisite_unit.code,
              requisiteType: r.requisite_type,
            })),
          ],
        }),
      )
    }
  }

  const firstSlot = template.semesters[0]
  const start = lastCompletedSlot
    ? nextSlot(lastCompletedSlot.year, lastCompletedSlot.semester)
    : { year: firstSlot?.year_number ?? 1, semester: (firstSlot?.sem_number === 2 ? 2 : 1) as 1 | 2 }

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

  // KNOWN GAP: result.warnings says why a unit could not be placed, and
  // GenerationResult has no field to carry it, so those units are dropped from
  // the plan silently. Adding `warnings` to GenerationResult needs James and
  // Olivia to agree, since the frontend depends on that type.

  const plannerUnitsByCode = new Map<string, Unit>()
  for (const semester of planner.semesters) {
    for (const unit of semester.units) {
      plannerUnitsByCode.set(unit.code.trim().toUpperCase(), unit)
    }
  }
  const labelBySlot = new Map(
    planner.semesters.map(s => [`${s.year}-${s.semester}`, s.label]),
  )

  const semesters: SemesterBlock[] = result.semesters.map(bucket => ({
    year: bucket.year,
    semester: bucket.semester,
    label: labelBySlot.get(`${bucket.year}-${bucket.semester}`) ?? `Semester ${bucket.semester}`,
    units: bucket.units.map((scheduled): Unit => {
      const plannerUnit = plannerUnitsByCode.get(scheduled.code.trim().toUpperCase())
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
      }
    }),
  }))

  return {
    semesters,
    completedCodes,
    electivePool: planner.electivePool,
  }
}
