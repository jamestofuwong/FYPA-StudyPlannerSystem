import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';
import {
  buildCustomPlan,
  validateSchedulerConfig,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';
import { recommendElectives } from '../../../../core/shared/scheduling/electiveSlots';
import { toSchedulableUnit } from '../../../../core/shared/scheduling/schedulableUnit';

/** Planner categories that count toward the elective requirement. */
const ELECTIVE_CATEGORIES = ['elective', 'prescribed_elective'];

/** The nested include every schedulable unit needs, used for planner and elective-group rows alike. */
const UNIT_INCLUDE = {
  offerings: true,
  requisite_groups: {
    include: { conditions: { include: { unit: true } } },
  },
} as const;

// Field extraction for this app's Prisma schema. The student app has its own
// adapter; the mapping rules they share live in core/shared/scheduling.
function toSchedulable(
  unit: { unit_code: string; unit_name: string; offerings: { offered_in: number }[]; requisite_groups: any[] },
  category: string
): SchedulableUnit {
  return toSchedulableUnit({
    code: unit.unit_code,
    name: unit.unit_name,
    category,
    offeringTerms: (unit.offerings ?? []).map((o) => o.offered_in),
    requisiteGroups: (unit.requisite_groups ?? []).map((group: any) =>
      (group.conditions ?? []).map((c: any) => ({
        type: c.type,
        unitCode: c.unit?.unit_code ?? null,
        creditPoints: c.credit_points,
        requisiteType: c.requisite_type,
      })),
    ),
  });
}

/**
 * How many elective slots still have to be filled.
 *
 * The planner's elective_count is the number of electives the degree requires,
 * so what is left is that number less the electives already passed and the ones
 * the planner names in the pool. A planner that never recorded a count falls
 * back to its own empty slots, which is what the count would have described.
 */
function countElectiveSlotsNeeded(
  planner: { elective_count: number | null; units: { unit: { unit_code: string } | null; category: unknown }[] },
  completedCodes: Set<string>,
  pool: SchedulableUnit[],
): number {
  const isElective = (category: unknown) => ELECTIVE_CATEGORIES.includes(String(category));

  if (planner.elective_count == null) {
    return planner.units.filter((tu) => tu.unit === null && isElective(tu.category)).length;
  }

  const completedElectives = planner.units.filter(
    (tu) =>
      tu.unit !== null &&
      isElective(tu.category) &&
      completedCodes.has(tu.unit.unit_code.toUpperCase()),
  ).length;
  const pooledElectives = pool.filter((u) => isElective(u.category)).length;

  return planner.elective_count - completedElectives - pooledElectives;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      plannerId, completedUnitCodes, startYear, startSemester, injectedMinorIds,
      concededPassUnitCodes, config,
    } = body;

    if (
      !plannerId ||
      typeof startYear !== 'number' ||
      (startSemester !== 1 && startSemester !== 2)
    ) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const configCheck = validateSchedulerConfig(config);
    if (!configCheck.ok) {
      return NextResponse.json({ error: `Invalid scheduler config: ${configCheck.error}` }, { status: 400 });
    }

    if (
      concededPassUnitCodes !== undefined &&
      !(Array.isArray(concededPassUnitCodes) && concededPassUnitCodes.every((c: unknown) => typeof c === 'string'))
    ) {
      return NextResponse.json({ error: 'concededPassUnitCodes must be an array of unit codes' }, { status: 400 });
    }

    const planner = await prisma.plannerTemplate.findUnique({
      where: { id: plannerId },
      include: {
        units: { include: { unit: { include: UNIT_INCLUDE } } },
        // Candidates for the planner's empty elective slots
        elective_groups: {
          orderBy: { created_at: 'asc' },
          include: { units: { include: { unit: { include: UNIT_INCLUDE } } } },
        },
      },
    });

    if (!planner) {
      return NextResponse.json({ error: 'Planner not found' }, { status: 404 });
    }

    if (planner.intake_month == null) {
      console.warn(`[custom-planner] planner ${plannerId} has no intake_month, assuming a Feb/Mar intake`);
    }
    const intakeSemester: 1 | 2 = (planner.intake_month ?? 1) >= 7 ? 2 : 1;

    const normalizedCompleted = new Set(
      (completedUnitCodes as string[]).map((c) => c.trim().toUpperCase())
    );

    // The core pool is all planner units the student has not yet completed/enrolled in
    const remainingUnits: SchedulableUnit[] = planner.units
      .filter((tu) => tu.unit !== null && !normalizedCompleted.has(tu.unit.unit_code.toUpperCase()))
      .map((tu) => toSchedulable(tu.unit!, String(tu.category)));

    // Minor injection
    const minorIds: string[] = Array.isArray(injectedMinorIds) ? injectedMinorIds : [];
    if (minorIds.length > 0) {
      const minors = await prisma.minor.findMany({
        where: { id: { in: minorIds } },
        include: { units: { include: { unit: { include: UNIT_INCLUDE } } } },
      });

      const poolCodes = new Set([
        ...normalizedCompleted,
        ...remainingUnits.map((u) => u.code.toUpperCase()),
      ]);

      for (const minor of minors) {
        for (const mu of minor.units) {
          const code = mu.unit.unit_code.toUpperCase();
          if (poolCodes.has(code)) continue;
          remainingUnits.push(toSchedulable(mu.unit, 'minor'));
          poolCodes.add(code);
        }
      }
    }

    // A planner records some electives as a slot with no unit_id, which the pool
    // above drops because there is nothing to place. Count how many of those the
    // student still owes and pick real units for them, or the plan comes out
    // short of the elective requirement with nothing on screen to say why.
    const electiveSlotsNeeded = countElectiveSlotsNeeded(planner, normalizedCompleted, remainingUnits);
    const recommended = recommendElectives({
      needed: electiveSlotsNeeded,
      // One source per elective group, in the order the planner lists them.
      candidateSources: planner.elective_groups.map((group) =>
        group.units.map((gu) => toSchedulable(gu.unit, 'elective')),
      ),
      completedUnitCodes: [...normalizedCompleted],
      alreadyPlannedCodes: remainingUnits.map((u) => u.code),
    });
    for (const unit of recommended) {
      remainingUnits.push({ ...unit, category: 'elective', recommended: true });
    }

    const result = buildCustomPlan(
      remainingUnits,
      completedUnitCodes as string[],
      startYear as number,
      startSemester as 1 | 2,
      intakeSemester,
      (concededPassUnitCodes as string[] | undefined) ?? [],
      configCheck.config
    );

    // A null requirement means the planner never recorded one, so it is left
    // out rather than sent as zero, which would read as "nothing required".
    const requirements = [
      { category: 'core', creditPoints: planner.core_cp, unitCount: planner.core_count, planCategories: ['core'] },
      { category: 'major', creditPoints: planner.major_cp, unitCount: planner.major_count, planCategories: ['major_core'] },
      { category: 'elective', creditPoints: planner.elective_cp, unitCount: planner.elective_count, planCategories: ['elective', 'prescribed_elective'] },
      { category: 'wil', creditPoints: planner.wil_cp, unitCount: planner.wil_count, planCategories: ['wil'] },
    ].filter((r) => r.creditPoints != null);

    // The pool is returned so the page can validate edits and offer the same
    // units in its add-unit picker, without asking for them again.
    return NextResponse.json({
      success: true,
      data: result,
      units: remainingUnits,
      intakeSemester,
      requirements,
      // Categories for units already completed, which the pool leaves out but
      // the requirement totals must still count
      completedUnits: planner.units
        .filter((tu) => tu.unit !== null && normalizedCompleted.has(tu.unit.unit_code.toUpperCase()))
        .map((tu) => toSchedulable(tu.unit!, String(tu.category))),
    });
  } catch (error) {
    console.error('[custom-planner]', error);
    return NextResponse.json({ error: 'Failed to generate custom plan' }, { status: 500 });
  }
}
