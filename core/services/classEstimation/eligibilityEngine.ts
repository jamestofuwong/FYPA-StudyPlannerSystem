// ============================================================
// Forward-looking eligibility check: can this student take unit X in a given future semester.
// checkRequisites() in core/services/matching/profileBuilder.ts is
// retrospective only, it flags problems among units already completed.
//
// Modeled on the canTake()/isConditionSatisfied() pair in
// core/services/scheduling/customPlannerScheduler.ts, but reads real DB
// requisite rows directly (type "unit" or "credit_points", OR-of-AND
// groups) instead of the matching domain's lossy flat Requisite[], so
// credit-point requisites are not lost here.
// ============================================================

import * as plannerRepository from '../../db/repositories/plannerRepository';

export type EligibilityRequisiteType = 'prerequisite' | 'corequisite' | 'antirequisite';

export interface EligibilityCondition {
  type: 'unit' | 'credit_points';
  requisiteType?: EligibilityRequisiteType;   // only for type === 'unit'
  unitCode?: string;                           // only for type === 'unit'
  creditPoints?: number;                       // only for type === 'credit_points'
}

export interface EligibilityUnit {
  unitCode: string;
  offeringSemesters: number[];                 // raw offered_in codes, 1 to 4, empty means always available
  requisiteGroups: EligibilityCondition[][];    // OR of AND
}

/**
 * Checks whether a unit can be taken in targetOfferedIn given the units the
 * student has already satisfied (completed, in progress, or picked earlier
 * in the same estimation round) and their flat credit total.
 *
 * satisfiedUnitCodes drives both directions of a requisite check:
 * prerequisite/corequisite need the code present, antirequisite needs it
 * absent, mirroring customPlannerScheduler's completed+bucketCodes union.
 */
export function isUnitEligible(
  unit: EligibilityUnit,
  targetOfferedIn: number,
  satisfiedUnitCodes: Set<string>,
  totalCreditsEarned: number,
): boolean {
  if (unit.offeringSemesters.length > 0 && !unit.offeringSemesters.includes(targetOfferedIn)) {
    return false;
  }
  if (unit.requisiteGroups.length === 0) {
    return true;
  }
  return unit.requisiteGroups.some((group) =>
    group.every((condition) => isConditionSatisfied(condition, satisfiedUnitCodes, totalCreditsEarned))
  );
}

function isConditionSatisfied(
  condition: EligibilityCondition,
  satisfiedUnitCodes: Set<string>,
  totalCreditsEarned: number,
): boolean {
  if (condition.type === 'credit_points') {
    return totalCreditsEarned >= (condition.creditPoints ?? 0);
  }

  if (condition.type === 'unit' && condition.unitCode) {
    const code = condition.unitCode.toUpperCase();
    if (condition.requisiteType === 'antirequisite') {
      return !satisfiedUnitCodes.has(code);
    }
    // prerequisite and corequisite both require the code to already be satisfied.
    return satisfiedUnitCodes.has(code);
  }

  return false;
}

// Minimal shape of a planner unit as returned by plannerRepository.getPlannerById(),
// covering only the fields this module reads.
type RawPlannerUnit = {
  unit_code: string;
  offerings: Array<{ offered_in: number }>;
  requisite_groups: Array<{
    conditions: Array<{
      type: string;
      requisite_type: string | null;
      credit_points: unknown;
      unit: { unit_code: string } | null;
    }>;
  }>;
};

function mapUnitToEligibilityUnit(unit: RawPlannerUnit): EligibilityUnit {
  return {
    unitCode: unit.unit_code,
    offeringSemesters: unit.offerings.map((o) => o.offered_in),
    requisiteGroups: unit.requisite_groups.map((group) =>
      group.conditions.map((condition): EligibilityCondition => ({
        type: condition.type as 'unit' | 'credit_points',
        requisiteType: (condition.requisite_type ?? undefined) as EligibilityRequisiteType | undefined,
        unitCode: condition.unit?.unit_code,
        creditPoints: condition.credit_points != null ? Number(condition.credit_points) : undefined,
      }))
    ),
  };
}

/**
 * Builds a unitCode -> EligibilityUnit lookup for every unit reachable from
 * a specific planner: its slotted TemplateUnit rows and its elective-group
 * pool units, since both are candidate categories for class estimation.
 */
export async function buildEligibilityUnitsFromPlanner(plannerId: string): Promise<Map<string, EligibilityUnit>> {
  const planner = await plannerRepository.getPlannerById(plannerId);
  const eligibilityUnits = new Map<string, EligibilityUnit>();
  if (!planner) return eligibilityUnits;

  for (const tu of planner.units) {
    if (!tu.unit) continue;
    if (eligibilityUnits.has(tu.unit.unit_code)) continue;
    eligibilityUnits.set(tu.unit.unit_code, mapUnitToEligibilityUnit(tu.unit));
  }

  for (const eg of planner.elective_groups) {
    for (const egu of eg.units) {
      if (eligibilityUnits.has(egu.unit.unit_code)) continue;
      eligibilityUnits.set(egu.unit.unit_code, mapUnitToEligibilityUnit(egu.unit));
    }
  }

  return eligibilityUnits;
}
