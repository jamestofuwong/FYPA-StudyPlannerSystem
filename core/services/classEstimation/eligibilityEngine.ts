// ============================================================
// Forward-looking eligibility check: can this student take unit X in a given future semester.
// checkRequisites() in core/services/matching/profileBuilder.ts is retrospective only, it flags problems
// among units already completed.
//
// This reuses canTake() and mapUnitToSchedulable() from customPlannerScheduler.ts rather than
// reimplementing them, an earlier version of this file did reimplement its own copy, and got the
// prerequisite/corequisite distinction wrong in the process (a prerequisite must come from prior
// completion only, a corequisite can also be satisfied by another unit picked in the same round). Reusing
// the already-correct, already-used-elsewhere logic avoids repeating that mistake.
// ============================================================

import {
  canTake,
  mapUnitToSchedulable,
  type SchedulableUnit,
  type RawSchedulableUnitRow,
} from '../scheduling/customPlannerScheduler';
import { getCachedPlannerById } from './plannerCache';

export type { SchedulableUnit };

// v1 does not resolve corequisites among candidates picked earlier in the same estimation round, that
// would need the same iterative fixed-point loop buildCustomPlan() uses across multiple semesters, which
// is out of scope for a single-semester eligibility check. A corequisite is therefore only satisfiable if
// it's already completed or in progress, same as a prerequisite, until that's built.
export function isUnitEligible(
  unit: SchedulableUnit,
  targetOfferedIn: 1 | 2,
  completedOrInProgress: Set<string>,
  totalCreditsEarned: number,
): boolean {
  return canTake(unit, targetOfferedIn, completedOrInProgress, new Set(), totalCreditsEarned);
}

/**
 * Builds a unitCode -> SchedulableUnit lookup for every unit reachable from a specific planner: its
 * slotted TemplateUnit rows and its elective-group pool units, since both are candidate categories for
 * class estimation.
 */
export async function buildEligibilityUnitsFromPlanner(plannerId: string): Promise<Map<string, SchedulableUnit>> {
  const planner = await getCachedPlannerById(plannerId);
  const eligibilityUnits = new Map<string, SchedulableUnit>();
  if (!planner) return eligibilityUnits;

  for (const tu of planner.units) {
    if (!tu.unit) continue;
    if (eligibilityUnits.has(tu.unit.unit_code)) continue;
    eligibilityUnits.set(tu.unit.unit_code, mapUnitToSchedulable(tu.unit as RawSchedulableUnitRow, tu.category));
  }

  for (const eg of planner.elective_groups) {
    for (const egu of eg.units) {
      if (eligibilityUnits.has(egu.unit.unit_code)) continue;
      eligibilityUnits.set(
        egu.unit.unit_code,
        mapUnitToSchedulable(egu.unit as RawSchedulableUnitRow, 'prescribed_elective'),
      );
    }
  }

  return eligibilityUnits;
}
