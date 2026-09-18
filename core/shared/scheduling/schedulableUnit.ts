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
  return {
    code: input.code,
    name: input.name,
    category: input.category,
    offeringSemesters,
    allOfferingTerms,
    requisiteGroups: toRequisiteGroups(input.requisiteGroups),
  };
}
