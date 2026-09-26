import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';
import {
  buildCustomPlan,
  validateSchedulerConfig,
  resolveNextStudyTerm,
  calendarTermFor,
  normaliseCode,
  resolveWilPlacementMilestone,
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
      plannerId, 
      completedUnitCodes, 
      courseList, 
      injectedMinorIds,
      concededPassUnitCodes, 
      config, 
      selectedDoubleMajorId,
    } = body;

    if (!plannerId) {
      return NextResponse.json({ error: 'Invalid request: plannerId is required' }, { status: 400 });
    }

    let startYear: number = body.startYear;
    let startSemester: 1 | 2 = body.startSemester;

    if (typeof startYear !== 'number' || (startSemester !== 1 && startSemester !== 2)) {
      const resolved = resolveNextStudyTerm(courseList ?? []);
      startYear = resolved.startYear;
      startSemester = resolved.startSemester;
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
        minors: {
          include: { units: { include: { unit: { include: UNIT_INCLUDE } } } },
        },
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
      .filter((tu) => tu.unit !== null && tu.category !== 'mpu' && !normalizedCompleted.has(tu.unit.unit_code.toUpperCase()))
      .map((tu) => toSchedulable(tu.unit!, String(tu.category)));

    const minorIds: string[] = Array.isArray(injectedMinorIds) ? injectedMinorIds : [];

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

    // Baseline simulation probe to find exact free elective slots needed
    const probe = schedule(remainingUnits);
    const baseElectiveSlotsNeeded = countElectiveSlotsNeeded({
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

    // Query Sibling Majors (Same course, year, intake)
    const siblingPlanners = await prisma.plannerTemplate.findMany({
      where: {
        course_id: planner.course_id,
        intake_year: planner.intake_year,
        intake_month: planner.intake_month,
        id: { not: planner.id },
      },
      include: {
        major: true,
        units: {
          where: { category: 'major_core' },
          include: { unit: { include: UNIT_INCLUDE } },
        },
      },
    });

    // Base degree units: only units fundamentally required by the primary planner
    const primaryUnitCodes = new Set(
      planner.units
        .filter((tu) => tu.unit !== null && tu.category !== 'elective')
        .map((tu) => tu.unit!.unit_code.toUpperCase())
    );

    // Units the currently active double major consumes
    const activeMajorUnits: SchedulableUnit[] = [];
    if (selectedDoubleMajorId) {
      const selectedSibling = siblingPlanners.find((s) => s.id === selectedDoubleMajorId);
      if (selectedSibling) {
        const missing = selectedSibling.units
          .filter((tu) => tu.unit !== null)
          .map((tu) => toSchedulable(tu.unit!, 'double_major'))
          .filter(
            (u) =>
              !normalizedCompleted.has(u.code.toUpperCase()) &&
              !primaryUnitCodes.has(u.code.toUpperCase())
          );
        activeMajorUnits.push(...missing);
      }
    }

    // Units the currently active minors consume
    const activeMinorUnits: SchedulableUnit[] = [];
    if (minorIds.length > 0) {
      const selectedMinorsData = (planner.minors ?? []).filter((m) => minorIds.includes(m.id));
      for (const sm of selectedMinorsData) {
        const missing = (sm.units ?? [])
          .filter((mu) => mu.unit !== null)
          .map((mu) => toSchedulable(mu.unit, 'minor'))
          .filter(
            (u) =>
              !normalizedCompleted.has(u.code.toUpperCase()) &&
              !primaryUnitCodes.has(u.code.toUpperCase())
          );
        activeMinorUnits.push(...missing);
      }
    }

    // Combine active swapped units to know current remaining free budget
    const currentlySwappedCodes = new Set([
      ...activeMajorUnits.map((u) => u.code.toUpperCase()),
      ...activeMinorUnits.map((u) => u.code.toUpperCase()),
    ]);
    const remainingElectiveBudget = Math.max(0, baseElectiveSlotsNeeded - currentlySwappedCodes.size);

    // Dynamic capacity for Double Majors
    // Cards remain visible if they could fit in base budget, but canFitInRemainingBudget disables them if no room
    const availableDoubleMajors = siblingPlanners
      .map((sibling) => {
        const missingUnits: SchedulableUnit[] = sibling.units
          .filter((tu) => tu.unit !== null)
          .map((tu) => toSchedulable(tu.unit!, 'double_major'))
          .filter(
            (u) =>
              !normalizedCompleted.has(u.code.toUpperCase()) &&
              !primaryUnitCodes.has(u.code.toUpperCase())
          );

        const neededCount = missingUnits.length;
        // Units this major needs that aren't already supplied by active selections
        const netNewUnitsNeeded = missingUnits.filter(
          (u) => !currentlySwappedCodes.has(u.code.toUpperCase())
        ).length;

        const isCurrentSelection = sibling.id === selectedDoubleMajorId;
        const fitsInBase = neededCount > 0 && neededCount <= baseElectiveSlotsNeeded;
        // Can be clicked if it's already active, or if its net new units fit into remaining budget
        const canFitInRemainingBudget = isCurrentSelection || (netNewUnitsNeeded > 0 && netNewUnitsNeeded <= remainingElectiveBudget);

        return {
          plannerId: sibling.id,
          majorId: sibling.major?.id ?? null,
          majorName: sibling.major?.name ?? 'Secondary Major',
          neededCount,
          netNewUnitsNeeded,
          canFitStrictly: fitsInBase || isCurrentSelection,
          canFitInRemainingBudget,
          remainingElectiveBudget,
          units: missingUnits,
        };
      })
      .filter((dm) => dm.canFitStrictly);

    // Dynamic capacity for Minors
    const availableMinors = (planner.minors ?? [])
      .map((minor) => {
        const missingUnits: SchedulableUnit[] = (minor.units ?? [])
          .filter((mu) => mu.unit !== null)
          .map((mu) => toSchedulable(mu.unit, 'minor'))
          .filter(
            (u) =>
              !normalizedCompleted.has(u.code.toUpperCase()) &&
              !primaryUnitCodes.has(u.code.toUpperCase())
          );

        const neededCount = missingUnits.length;
        const netNewUnitsNeeded = missingUnits.filter(
          (u) => !currentlySwappedCodes.has(u.code.toUpperCase())
        ).length;

        const isCurrentlyInjected = minorIds.includes(minor.id);
        const fitsInBase = neededCount > 0 && neededCount <= baseElectiveSlotsNeeded;
        const canFitInRemainingBudget = isCurrentlyInjected || (netNewUnitsNeeded > 0 && netNewUnitsNeeded <= remainingElectiveBudget);

        return {
          minorId: minor.id,
          minorName: minor.name,
          neededCount,
          netNewUnitsNeeded,
          canFitStrictly: fitsInBase || isCurrentlyInjected,
          canFitInRemainingBudget,
          remainingElectiveBudget,
          units: missingUnits,
        };
      })
      .filter((m) => m.canFitStrictly);

    // Combine and deduplicate swapped units up to baseElectiveSlotsNeeded
    const extraUnitsToSwap = new Map<string, SchedulableUnit>();

    for (const dmUnit of activeMajorUnits) {
      extraUnitsToSwap.set(dmUnit.code.toUpperCase(), {
        ...dmUnit,
        category: 'double_major',
        recommended: true,
      });
    }

    for (const mUnit of activeMinorUnits) {
      const code = mUnit.code.toUpperCase();
      if (!extraUnitsToSwap.has(code)) {
        extraUnitsToSwap.set(code, {
          ...mUnit,
          category: 'minor',
          recommended: true,
        });
      }
    }

    // Safety Cap: never allow swapped units to exceed the total base free elective slots
    let slotsToDeduct = 0;
    for (const [code, unit] of extraUnitsToSwap.entries()) {
      if (slotsToDeduct < baseElectiveSlotsNeeded) {
        if (!remainingUnits.some((u) => u.code.toUpperCase() === code)) {
          remainingUnits.push(unit);
        }
        slotsToDeduct++;
      }
    }

    // Deduct swapped units from remaining slots
    let electiveSlotsNeeded = Math.max(0, baseElectiveSlotsNeeded - slotsToDeduct);
    const startCalendarTerm = calendarTermFor(startSemester, intakeSemester);
    // If any free elective slots still remain, fill with general recommendations
    if (electiveSlotsNeeded > 0) {
      const recommended = recommendElectives({
        needed: electiveSlotsNeeded,
        preferredTerm: startCalendarTerm,
        candidateSources: planner.elective_groups.map((group) =>
          group.units.map((gu) => toSchedulable(gu.unit, 'elective')),
        ),
        completedUnitCodes: [...normalizedCompleted],
        alreadyPlannedCodes: remainingUnits.map((u) => u.code),
      });

      for (const unit of recommended) {
        remainingUnits.push({ ...unit, category: 'elective', recommended: true });
      }
    }

    // Final Plan Scheduling
    const result = schedule(remainingUnits);

    // Pass the unscheduled SchedulableUnit objects (which carry category and creditPoints)
    const unscheduledSchedulables = remainingUnits.filter((u) =>
      result.unschedulableUnits.some((un) => normaliseCode(un.code) === normaliseCode(u.code))
    );

    // Resolve timeline break milestones (e.g. WIL placement before FYP A)
    const inProgressCount = (courseList ?? []).filter((c: any) => c.status === 'in_progress').length;
    const wilMilestone = resolveWilPlacementMilestone({
      unscheduledUnits: unscheduledSchedulables,
      semesters: result.semesters,
      hasCurrentEnrolledUnits: inProgressCount > 0,
      intakeSemester,
      plannerWilCp: planner.wil_cp,
    });

    // A null requirement means the planner never recorded one, so it is left
    // out rather than sent as zero, which would read as "nothing required".
    const requirements = [
      { category: 'core', creditPoints: planner.core_cp, unitCount: planner.core_count, planCategories: ['core'] },
      { category: 'major', creditPoints: planner.major_cp, unitCount: planner.major_count, planCategories: ['major_core'] },
      { category: 'elective', creditPoints: planner.elective_cp, unitCount: planner.elective_count, planCategories: ['elective', 'prescribed_elective', 'double_major', 'minor'] },
      { category: 'wil', creditPoints: planner.wil_cp, unitCount: planner.wil_count, planCategories: ['wil'] },
    ].filter((r) => r.creditPoints != null);

    // The pool is returned so the page can validate edits and offer the same
    // units in its add-unit picker, without asking for them again.
    return NextResponse.json({
      success: true,
      data: result,
      units: remainingUnits,
      startYear,
      startSemester,
      intakeSemester,
      requirements,
      // The planner's elective-group units, for the elective picker. Mapped as
      // electives, the category an advisor's choice from this list will carry.
      electiveCandidates: electiveGroupUnits.map((unit) => toSchedulable(unit, 'elective')),
      availableDoubleMajors,
      availableMinors,
      breakMilestones: wilMilestone ? [wilMilestone] : [],
      // Categories for units already completed, which the pool leaves out but
      // the requirement totals must still count. A unit the planner only offers
      // as an elective candidate is an elective the student has taken, so it is
      // listed too, or the elective total comes up short.
      completedUnits: [
        ...namedCompleted.map((tu) => toSchedulable(tu.unit!, String(tu.category))),
        // Any completed unit not explicitly named as core or MPU is credited as an elective
        ...[...normalizedCompleted]
          .filter((code) =>
              !namedCodes.has(code) &&
              !code.startsWith('MPU') &&
              code !== 'AIMFECS' &&
              code !== 'AIM-FECS' &&
              code !== 'AIMSFS' &&
              code !== 'AIM-SFS'
          )
          .map((code) => {
            // Check if this completed unit is the 25 CP optional industry project
            const isOptional25Cp = code.includes('ICT20016') && code.includes('OPTIONAL');

            // Find if full unit metadata exists in elective groups or create a standard 12.5 CP unit
            const found = electiveGroupUnits.find((u) => u.unit_code.toUpperCase() === code);
            if (found) return toSchedulable(found, 'elective');
            return {
              code,
              name: code,
              category: 'elective',
              offeringSemesters: [1, 2] as (1 | 2)[],
              requisiteGroups: [],
              creditPoints: isOptional25Cp ? 25 : 12.5, 
            };
          }),
      ],
    });
  } catch (error) {
    console.error('[custom-planner]', error);
    return NextResponse.json({ error: 'Failed to generate custom plan' }, { status: 500 });
  }
}
