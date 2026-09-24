import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';
import {
  buildCustomPlan,
  validateSchedulerConfig,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';
import {
  blockedByRequisites,
  countElectiveSlotsNeeded,
  recommendElectives,
} from '../../../../core/shared/scheduling/electiveSlots';
import { UNIT_INCLUDE, toSchedulable } from './unitMapping';

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

    // Units the planner names outright, and the completed ones among them. A
    // named unit keeps its own category even where an elective group repeats it.
    const namedCodes = new Set(
      planner.units.filter((tu) => tu.unit !== null).map((tu) => tu.unit!.unit_code.toUpperCase()),
    );
    const namedCompleted = planner.units.filter(
      (tu) => tu.unit !== null && normalizedCompleted.has(tu.unit.unit_code.toUpperCase()),
    );

    // Every unit the planner's elective groups offer, deduplicated in case two
    // groups list the same one
    const electiveGroupUnits = [
      ...new Map(
        planner.elective_groups.flatMap((group) =>
          group.units.map((gu) => [gu.unit.unit_code.toUpperCase(), gu.unit] as const),
        ),
      ).values(),
    ];

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

    const schedule = (pool: SchedulableUnit[]) =>
      buildCustomPlan(
        pool,
        completedUnitCodes as string[],
        startYear as number,
        startSemester as 1 | 2,
        intakeSemester,
        (concededPassUnitCodes as string[] | undefined) ?? [],
        configCheck.config
      );

    // A planner records some electives as a slot with no unit_id, which the pool
    // above drops because there is nothing to place. Count how many of those the
    // student still owes and pick real units for them.
    //
    // The pool is scheduled twice on purpose: whether an elective already in the
    // pool fills its slot is only knowable after a run, since one blocked by a
    // requisite is never placed and leaves its slot to a recommendation. The
    // first run answers that and is discarded; the second is the plan returned.
    const probe = schedule(remainingUnits);
    const electiveSlotsNeeded = countElectiveSlotsNeeded({
      electiveCount: planner.elective_count,
      plannerUnits: planner.units.map((tu) => ({
        category: String(tu.category),
        unitCode: tu.unit?.unit_code ?? null,
      })),
      electiveGroupCodes: electiveGroupUnits.map((u) => u.unit_code),
      completedUnitCodes: [...normalizedCompleted],
      pool: remainingUnits,
      blockedUnitCodes: blockedByRequisites(probe),
    });

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

    const result = recommended.length > 0 ? schedule(remainingUnits) : probe;

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
      // the requirement totals must still count. A unit the planner only offers
      // as an elective candidate is an elective the student has taken, so it is
      // listed too, or the elective total comes up short.
      completedUnits: [
        ...namedCompleted.map((tu) => toSchedulable(tu.unit!, String(tu.category))),
        ...electiveGroupUnits
          .filter(
            (unit) =>
              normalizedCompleted.has(unit.unit_code.toUpperCase()) &&
              !namedCodes.has(unit.unit_code.toUpperCase()),
          )
          .map((unit) => toSchedulable(unit, 'elective')),
      ],
    });
  } catch (error) {
    console.error('[custom-planner]', error);
    return NextResponse.json({ error: 'Failed to generate custom plan' }, { status: 500 });
  }
}
