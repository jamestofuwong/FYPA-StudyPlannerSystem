// Shared mapping from a planner row to a SchedulableUnit.
//
// The advisor app and the student app read different databases with different
// Prisma schemas, so each supplies its own field extraction and calls in here.
// The rules that must not drift between them live in this file: which offering
// terms the scheduler can place, and how requisite groups are built.

import type {
  RequisiteCondition,
  SchedulableUnit,
} from '../../services/scheduling/customPlannerScheduler';

/** Terms the scheduler cycles. Summer (3) and winter (4) are reported, never placed. */
export const SCHEDULED_TERMS: ReadonlyArray<1 | 2> = [1, 2];

/** A requisite condition as either app's rows describe it, before normalising. */
export type RequisiteConditionInput = {
  type: 'unit' | 'credit_points' | string;
  unitCode?: string | null;
  creditPoints?: number | string | null;
  requisiteType?: string | null;
};

export type SchedulableUnitInput = {
  code: string;
  name: string;
  category: string;
  /** Raw offering terms, 1-4. Empty means no offering data was recorded. */
  offeringTerms?: number[];
  /** Groups are OR, conditions within a group are AND. */
  requisiteGroups?: RequisiteConditionInput[][];
  /** Only some schemas record this. Omitted means the caller derives it. */
  creditPoints?: number | string | null;
};

/**
 * Splits raw offering terms into the full list and the placeable subset.
 * A unit offered only in summer or winter keeps a non-empty allOfferingTerms
 * with an empty offeringSemesters, which the scheduler reports rather than
 * treating as unrestricted.
 */
export function splitOfferingTerms(terms: ReadonlyArray<number> | null | undefined): {
  allOfferingTerms: number[];
  offeringSemesters: (1 | 2)[];
} {
  const allOfferingTerms = [...new Set(terms ?? [])].sort((a, b) => a - b);
  const offeringSemesters = allOfferingTerms.filter(
    (term): term is 1 | 2 => term === 1 || term === 2,
  );
  return { allOfferingTerms, offeringSemesters };
}

/**
 * Normalises requisite groups, dropping conditions the scheduler cannot act on:
 * a unit condition with no code, and any group left empty by that.
 */
export function toRequisiteGroups(
  groups: ReadonlyArray<ReadonlyArray<RequisiteConditionInput>> | null | undefined,
): RequisiteCondition[][] {
  return (groups ?? [])
    .map((group) =>
      (group ?? [])
        .map((condition): RequisiteCondition | null => {
          if (condition.type === 'credit_points') {
            return { type: 'credit_points', creditPoints: Number(condition.creditPoints) };
          }
          if (condition.type === 'unit' && condition.unitCode) {
            return {
              type: 'unit',
              requisiteType: (condition.requisiteType ?? 'prerequisite') as
                'prerequisite' | 'corequisite' | 'antirequisite',
              unitCode: condition.unitCode.toUpperCase(),
            };
          }
          return null;
        })
        .filter((condition): condition is RequisiteCondition => condition !== null),
    )
    .filter((group) => group.length > 0);
}

export function toSchedulableUnit(input: SchedulableUnitInput): SchedulableUnit {
  const { allOfferingTerms, offeringSemesters } = splitOfferingTerms(input.offeringTerms);
  const creditPoints = input.creditPoints == null ? undefined : Number(input.creditPoints);
  return {
    code: input.code,
    name: input.name,
    category: input.category,
    offeringSemesters,
    allOfferingTerms,
    requisiteGroups: toRequisiteGroups(input.requisiteGroups),
    ...(creditPoints !== undefined && Number.isFinite(creditPoints) ? { creditPoints } : {}),
  };
}


/**
 * A unit as either app's database returns it, with its offerings and requisite
 * groups included. The two Prisma schemas use the same column names for this, so
 * one structural type covers both without importing either client.
 */
export type UnitRow = {
  unit_code: string;
  unit_name: string;
  credit_points?: unknown;
  offerings?: ReadonlyArray<{ offered_in: number }> | null;
  requisite_groups?: ReadonlyArray<{
    conditions?: ReadonlyArray<{
      type: string;
      credit_points?: unknown;
      requisite_type?: string | null;
      unit?: { unit_code: string } | null;
    }> | null;
  }> | null;
};

/**
 * Maps a database unit to the scheduler's shape.
 *
 * Credit points are only carried when asked for: the advisor has never passed
 * them, and its plans would change if it started to.
 */
export function unitRowToSchedulable(
  unit: UnitRow,
  category: string,
  options: { withCreditPoints?: boolean } = {},
): SchedulableUnit {
  return toSchedulableUnit({
    code: unit.unit_code,
    name: unit.unit_name,
    category,
    offeringTerms: (unit.offerings ?? []).map((o) => o.offered_in),
    requisiteGroups: (unit.requisite_groups ?? []).map((group) =>
      (group.conditions ?? []).map((c) => ({
        type: c.type,
        unitCode: c.unit?.unit_code ?? null,
        creditPoints: c.credit_points as RequisiteConditionInput['creditPoints'],
        requisiteType: c.requisite_type,
      })),
    ),
    ...(options.withCreditPoints ? { creditPoints: unit.credit_points as SchedulableUnitInput['creditPoints'] } : {}),
  });
}
