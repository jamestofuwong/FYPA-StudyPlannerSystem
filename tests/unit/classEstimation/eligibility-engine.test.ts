// ============================================================
// Tests for core/services/classEstimation/eligibilityEngine.ts.
// This is the forward-looking "can this student take unit X next semester" check.
// checkRequisites() in profileBuilder.ts only validates units already completed.
// isUnitEligible() is now a thin wrapper around customPlannerScheduler.ts's canTake(), reused rather than
// reimplemented, an earlier version of this file duplicated that logic and got the prerequisite/corequisite
// distinction wrong in the process. buildEligibilityUnitsFromPlanner() reads from
// plannerRepository.getPlannerById() via the shared plannerCache.ts, which is mocked here.
// ============================================================

import {
  isUnitEligible,
  buildEligibilityUnitsFromPlanner,
  type EligibilityInput,
  type SchedulableUnit,
} from '@core/services/classEstimation/eligibilityEngine';
import { resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

function unit(overrides: Partial<SchedulableUnit> = {}): SchedulableUnit {
  return { code: 'U1', name: 'Unit U1', category: 'core', offeringSemesters: [], requisiteGroups: [], ...overrides };
}

// Named inputs with sensible blanks, so each test only states the part it cares about. canTake() shifted its
// own parameters once already and broke every caller silently, which is why these are no longer positional.
function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    targetTerm: 1,
    completedOrInProgress: new Set(),
    concededPass: new Set(),
    totalCreditsEarned: 0,
    ...overrides,
  };
}

describe('isUnitEligible', () => {
  test('a unit with no offering rows is available in any semester', () => {
    expect(isUnitEligible(unit(), input({ targetTerm: 1 }))).toBe(true);
    expect(isUnitEligible(unit(), input({ targetTerm: 2 }))).toBe(true);
  });

  test('a unit only offered in semester 2 is not eligible for semester 1', () => {
    const u = unit({ offeringSemesters: [2], allOfferingTerms: [2] });
    expect(isUnitEligible(u, input({ targetTerm: 1 }))).toBe(false);
    expect(isUnitEligible(u, input({ targetTerm: 2 }))).toBe(true);
  });

  // The two empty-offeringSemesters cases must not behave the same way. No offering data at all stays
  // permissive, since most units in the catalogue currently have none. Data that says summer or winter only
  // is respected, so a winter placement isn't offered as a semester 1 or 2 candidate.
  test('a short-term-only unit is not eligible in either semester, unlike one with no offering data', () => {
    const winterOnly = unit({ offeringSemesters: [], allOfferingTerms: [4] });
    expect(isUnitEligible(winterOnly, input({ targetTerm: 1 }))).toBe(false);
    expect(isUnitEligible(winterOnly, input({ targetTerm: 2 }))).toBe(false);

    const noData = unit({ offeringSemesters: [], allOfferingTerms: [] });
    expect(isUnitEligible(noData, input({ targetTerm: 1 }))).toBe(true);
    expect(isUnitEligible(noData, input({ targetTerm: 2 }))).toBe(true);
  });

  test('a prerequisite must already be completed or in progress', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]] });
    expect(isUnitEligible(u, input())).toBe(false);
    expect(isUnitEligible(u, input({ completedOrInProgress: new Set(['BASE']) }))).toBe(true);
  });

  // v1 doesn't resolve corequisites among candidates picked in the same round, that would need the same
  // iterative fixed-point loop buildCustomPlan() uses across multiple semesters, out of scope for a single
  // target-semester check. A corequisite therefore behaves the same as a prerequisite here, it must already
  // be completed or in progress, it can't be satisfied by another candidate picked in this same run.
  test('a corequisite must also already be completed or in progress, same as a prerequisite in v1', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'corequisite', unitCode: 'PAIR' }]] });
    expect(isUnitEligible(u, input())).toBe(false);
    expect(isUnitEligible(u, input({ completedOrInProgress: new Set(['PAIR']) }))).toBe(true);
  });

  test('an antirequisite blocks the unit if the conflicting code is present', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'antirequisite', unitCode: 'OLD' }]] });
    expect(isUnitEligible(u, input({ completedOrInProgress: new Set(['OLD']) }))).toBe(false);
    expect(isUnitEligible(u, input())).toBe(true);
  });

  // This is the case the argument shift silently broke: totalCredits arrived undefined, so every
  // credit-point rule evaluated false and gated units were permanently ineligible.
  test('a credit_points condition checks the credit total', () => {
    const u = unit({ requisiteGroups: [[{ type: 'credit_points', creditPoints: 50 }]] });
    expect(isUnitEligible(u, input({ totalCreditsEarned: 37.5 }))).toBe(false);
    expect(isUnitEligible(u, input({ totalCreditsEarned: 50 }))).toBe(true);
  });

  test('OR-of-AND groups: eligible if any single group is fully satisfied', () => {
    const u = unit({
      requisiteGroups: [
        [{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'MISSING' }],
        [{ type: 'credit_points', creditPoints: 25 }],
      ],
    });
    expect(isUnitEligible(u, input({ totalCreditsEarned: 25 }))).toBe(true);
    expect(isUnitEligible(u, input({ totalCreditsEarned: 0 }))).toBe(false);
  });

  // A Conceded Pass earns credit, so the unit isn't owed again, but it cannot satisfy a prerequisite or
  // corequisite (Swinburne Conceded Pass form, May 2023). An empty set used to be passed here, so a CP
  // wrongly unlocked the next unit in a chain.
  describe('Conceded Pass', () => {
    test('does not satisfy a prerequisite, even though the unit is completed', () => {
      const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]] });
      const completedOrInProgress = new Set(['BASE']);

      expect(isUnitEligible(u, input({ completedOrInProgress }))).toBe(true);
      expect(isUnitEligible(u, input({ completedOrInProgress, concededPass: new Set(['BASE']) }))).toBe(false);
    });

    test('does not satisfy a corequisite either', () => {
      const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'corequisite', unitCode: 'PAIR' }]] });
      const completedOrInProgress = new Set(['PAIR']);

      expect(isUnitEligible(u, input({ completedOrInProgress, concededPass: new Set(['PAIR']) }))).toBe(false);
    });

    // A CP still counts as having taken the unit, so it must keep blocking a clashing unit.
    test('still blocks an antirequisite', () => {
      const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'antirequisite', unitCode: 'OLD' }]] });

      expect(isUnitEligible(u, input({
        completedOrInProgress: new Set(['OLD']),
        concededPass: new Set(['OLD']),
      }))).toBe(false);
    });

    test('a CP in an unrelated unit does not affect eligibility', () => {
      const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]] });

      expect(isUnitEligible(u, input({
        completedOrInProgress: new Set(['BASE', 'OTHER']),
        concededPass: new Set(['OTHER']),
      }))).toBe(true);
    });
  });
});

describe('buildEligibilityUnitsFromPlanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
  });

  test('returns an empty map when the planner does not exist', async () => {
    getPlannerById.mockResolvedValue(null as never);
    expect(await buildEligibilityUnitsFromPlanner('missing')).toEqual(new Map());
  });

  // Both slotted TemplateUnit rows and elective-group pool units are candidate categories for class
  // estimation, so both need to end up in the lookup, not just the slotted ones.
  test('maps slotted units and elective-pool units into the lookup', async () => {
    getPlannerById.mockResolvedValue({
      units: [{
        category: 'core',
        unit: {
          unit_code: 'COS10009',
          unit_name: 'Introduction to Programming',
          offerings: [{ offered_in: 1 }],
          requisite_groups: [{
            conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: 'COS10001' } }],
          }],
        },
      }],
      elective_groups: [
        { units: [{ unit: { unit_code: 'COS40006', unit_name: 'Elective', offerings: [], requisite_groups: [] } }] },
      ],
    } as never);

    const map = await buildEligibilityUnitsFromPlanner('p1');

    expect(map.get('COS10009')).toEqual({
      code: 'COS10009',
      name: 'Introduction to Programming',
      category: 'core',
      offeringSemesters: [1],
      allOfferingTerms: [1],
      requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'COS10001' }]],
    });
    expect(map.has('COS40006')).toBe(true);
  });

  test('skips TemplateUnit rows with no linked unit', async () => {
    getPlannerById.mockResolvedValue({ units: [{ unit: null }], elective_groups: [] } as never);
    expect(await buildEligibilityUnitsFromPlanner('p1')).toEqual(new Map());
  });

  // Confirms the shared plannerCache.ts is actually doing its job here, a second call for the same
  // plannerId should not hit the database again.
  test('reuses the cached planner fetch across repeated calls for the same plannerId', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    await buildEligibilityUnitsFromPlanner('p1');
    await buildEligibilityUnitsFromPlanner('p1');

    expect(getPlannerById).toHaveBeenCalledTimes(1);
  });
});
