import 'server-only'
import { DEFAULT_SCHEDULER_CONFIG } from '@core/services/scheduling/customPlannerScheduler'
import type { SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler'
import {
  finishPlanForPlanner,
  startPlanForPlanner,
  type PlannerPlanInput,
} from '@core/services/scheduling/planForPlanner'
import { unitRowToSchedulable, type UnitRow } from '@core/shared/scheduling/schedulableUnit'
import { describePlanWarning } from '@core/shared/scheduling/planWarnings'
import type { GenerationInput, GenerationResult } from './plan-builder'
import { getPlannerById } from './planners'
import { prisma } from './prisma'
import { requisiteUnitCodes, toRequisiteGroups } from './requisites'
import type { SemesterBlock, Unit } from './types'

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

// Everything the scheduler needs to know about a unit, nested the way the shared
// mapper reads it
const UNIT_INCLUDE = {
  offerings: true,
  requisite_groups: {
    include: {
      conditions: {
        include: { unit: { select: { unit_code: true } } },
      },
    },
  },
} as const

async function loadPlannerTemplateForGeneration(id: string) {
  return prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      units: {
        orderBy: [{ year_level: 'asc' }, { semester: 'asc' }, { created_at: 'asc' }],
        include: { unit: { include: UNIT_INCLUDE } },
      },
      // The units an advisor would pick from to fill an empty elective slot
      elective_groups: {
        orderBy: { created_at: 'asc' },
        include: { units: { include: { unit: { include: UNIT_INCLUDE } } } },
      },
    },
  })
}

type PlannerTemplateForGeneration = NonNullable<Awaited<ReturnType<typeof loadPlannerTemplateForGeneration>>>

/** The same mapping the advisor uses, so a unit means the same to the scheduler in both apps. */
function toSchedulable(unit: UnitRow, category: string): SchedulableUnit {
  return unitRowToSchedulable(unit, category, { withCreditPoints: true })
}

async function loadUnitMetadataByCodes(codes: Set<string>): Promise<Map<string, Unit>> {
  if (codes.size === 0) return new Map()

  const units = await prisma.unit.findMany({
    where: { unit_code: { in: [...codes] } },
    include: {
      requisite_groups: {
        include: {
          conditions: {
            include: { unit: { select: { unit_code: true } } },
          },
        },
      },
    },
  })

  return new Map(units.map(unit => {
    const requisiteGroups = toRequisiteGroups(unit.requisite_groups)
    return [unit.unit_code.trim().toUpperCase(), {
      id: unit.id,
      code: unit.unit_code,
      name: unit.unit_name,
      category: 'elective' as Unit['category'],
      creditPoints: Number(unit.credit_points),
      yearLevel: unit.year_level ?? 1,
      semester: 0,
      isElectiveSlot: false,
      requisiteGroups,
      prerequisites: requisiteUnitCodes(requisiteGroups, 'prerequisite'),
      sourceMajorName: null,
    }]
  }))
}

type DisplayUnitRow = NonNullable<PlannerTemplateForGeneration['units'][number]['unit']>

function toDisplayUnit(
  unit: DisplayUnitRow,
  id: string,
  category: string,
  sourceMajorName?: string | null,
): Unit {
  const requisiteGroups = toRequisiteGroups(unit.requisite_groups)
  return {
    id,
    code: unit.unit_code,
    name: unit.unit_name,
    category: category as Unit['category'],
    creditPoints: Number(unit.credit_points),
    yearLevel: unit.year_level ?? 1,
    semester: 0,
    isElectiveSlot: false,
    requisiteGroups,
    prerequisites: requisiteUnitCodes(requisiteGroups, 'prerequisite'),
    sourceMajorName: sourceMajorName ?? null,
  }
}

function completedSemesterBlocks(
  completedSemesters: { unitCodes: string[] }[],
  unitMetadataByCode: Map<string, Unit>,
): SemesterBlock[] {
  return completedSemesters.flatMap((semester, index): SemesterBlock[] => {
    const unitCodes = semester.unitCodes.map(code => code.trim().toUpperCase()).filter(Boolean)
    if (unitCodes.length === 0) return []

    const year = Math.floor(index / 2) + 1
    const semesterNumber = index % 2 === 0 ? 1 : 2
    return [{
      year,
      semester: semesterNumber,
      label: `Semester ${semesterNumber}`,
      units: unitCodes.map((code): Unit => {
        const unit = unitMetadataByCode.get(code)
        return {
          id: unit?.id ?? `completed-${index}-${code}`,
          code,
          name: unit?.name ?? code,
          category: unit?.category ?? 'elective',
          creditPoints: unit?.creditPoints ?? 12.5,
          yearLevel: unit?.yearLevel ?? year,
          semester: semesterNumber,
          isElectiveSlot: false,
          requisiteGroups: unit?.requisiteGroups,
          prerequisites: unit?.prerequisites ?? [],
          sourceMajorName: unit?.sourceMajorName ?? null,
        }
      }),
    }]
  })
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
  const completedUnitMetadataByCode = await loadUnitMetadataByCodes(completedCodes)

  // Requisites and availability are not on PlannerDetail, so read them separately
  const template = await loadPlannerTemplateForGeneration(config.plannerId)
  if (!template) return null

  const unitMetadataByCode = new Map<string, Unit>(completedUnitMetadataByCode)
  for (const slot of template.units) {
    if (!slot.unit) continue
    unitMetadataByCode.set(
      slot.unit.unit_code.trim().toUpperCase(),
      toDisplayUnit(slot.unit, slot.id, slot.category, slot.category === 'major_core' ? planner.majorName : null),
    )
  }

  const start = startAfterCompletedSemesters(completedSemesters)

  // The planner's own intake decides which calendar term "semester 1" is; the
  // chosen intake month is only the fallback for a planner that never recorded one.
  const intakeSemester: 1 | 2 = (template.intake_month ?? config.intakeMonth) >= 7 ? 2 : 1

  // The plan is built by the same code the advisor's Student Pathway uses. No
  // grade data reaches this app, only completed codes, so no unit can be known to
  // be a Conceded Pass.
  const planInput: PlannerPlanInput = {
    plannerUnits: template.units.map(slot => ({
      category: slot.category,
      unit: slot.unit ? toSchedulable(slot.unit, slot.category) : null,
    })),
    electiveCount: template.elective_count,
    electiveGroups: template.elective_groups.map(group =>
      group.units.map(groupUnit => toSchedulable(groupUnit.unit, 'elective')),
    ),
    completedUnitCodes: [...completedCodes],
    startYear: start.year,
    startSemester: start.semester,
    intakeSemester,
    // This app has no separate MPU section, so a required MPU unit has to be in the plan
    scheduleMpu: true,
  }
  const planStart = startPlanForPlanner(planInput)

  const warnings: string[] = []

  // A second major takes the place of elective slots rather than extending the
  // plan, and only fits when it needs no more units than there are free slots.
  // That is the rule the advisor applies before it offers a double major.
  let swapped: SchedulableUnit[] = []
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
        units: {
          where: { category: 'major_core' },
          orderBy: [{ year_level: 'asc' }, { semester: 'asc' }, { created_at: 'asc' }],
          include: { unit: { include: UNIT_INCLUDE } },
        },
      },
    })

    if (!secondMajorTemplate) {
      warnings.push('No Program Study Planner is available for the selected second major and intake. The generated plan uses your primary major only.')
    } else {
      const majorName = secondMajorTemplate.major?.name ?? 'The selected second major'
      const primaryCodes = new Set(
        template.units
          .filter(slot => slot.unit && slot.category !== 'elective')
          .map(slot => slot.unit!.unit_code.trim().toUpperCase()),
      )
      const missing = secondMajorTemplate.units.flatMap(slot => {
        if (!slot.unit) return []
        const code = slot.unit.unit_code.trim().toUpperCase()
        if (completedCodes.has(code) || primaryCodes.has(code)) return []
        unitMetadataByCode.set(code, toDisplayUnit(slot.unit, slot.id, 'double_major', secondMajorTemplate.major?.name ?? null))
        return [toSchedulable(slot.unit, 'double_major')]
      })

      if (missing.length === 0) {
        warnings.push(`${majorName} needs no units beyond your primary major, so it adds nothing to this plan.`)
      } else if (missing.length > planStart.freeElectiveSlots) {
        warnings.push(
          `${majorName} needs ${missing.length} more unit${missing.length === 1 ? '' : 's'}, but only ${planStart.freeElectiveSlots} elective slot${planStart.freeElectiveSlots === 1 ? ' is' : 's are'} free. The generated plan uses your primary major only.`,
        )
      } else {
        swapped = missing
      }
    }
  }

  const finished = finishPlanForPlanner(planInput, planStart, swapped)
  const result = finished.result

  // Say why a unit was left out, in the words the advisor's page uses
  for (const warning of result.warnings) {
    const message = describePlanWarning(warning, DEFAULT_SCHEDULER_CONFIG.maxSemesters, intakeSemester)
    if (message && !warnings.includes(message)) warnings.push(message)
  }

  // Electives recommended for the open slots are drawn from the planner's groups
  for (const group of template.elective_groups) {
    for (const groupUnit of group.units) {
      const code = groupUnit.unit.unit_code.trim().toUpperCase()
      if (!unitMetadataByCode.has(code)) {
        unitMetadataByCode.set(code, toDisplayUnit(groupUnit.unit, groupUnit.unit_id, 'elective'))
      }
    }
  }

  for (const semester of planner.semesters) {
    for (const unit of semester.units) {
      if (!unitMetadataByCode.has(unit.code.trim().toUpperCase())) {
        unitMetadataByCode.set(unit.code.trim().toUpperCase(), unit)
      }
    }
  }
  const scheduledSemesters: SemesterBlock[] = result.semesters.map(bucket => ({
    year: bucket.year,
    semester: bucket.semester,
    // The template may call this slot "Winter Term". The generated plan uses the semester number the student is continuing from.
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
        requisiteGroups: plannerUnit?.requisiteGroups,
        prerequisites: plannerUnit?.prerequisites ?? [],
        sourceMajorName: plannerUnit?.sourceMajorName ?? null,
      }
    }),
  }))
  const semesters: SemesterBlock[] = [
    ...completedSemesterBlocks(completedSemesters, unitMetadataByCode),
    ...scheduledSemesters,
  ]

  return {
    semesters,
    completedCodes,
    electivePool: planner.electivePool,
    warnings,
  }
}
