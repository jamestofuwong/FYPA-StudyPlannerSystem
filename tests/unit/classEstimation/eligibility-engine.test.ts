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
  type SchedulableUnit,
} from '@core/services/classEstimation/eligibilityEngine';
import { resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

function unit(overrides: Partial<SchedulableUnit> = {}): SchedulableUnit {
  return { code: 'U1', name: 'Unit U1', category: 'core', offeringSemesters: [], requisiteGroups: [], ...overrides };
}

describe('isUnitEligible', () => {
  test('a unit with no offering rows is available in any semester', () => {
    expect(isUnitEligible(unit(), 1, new Set(), 0)).toBe(true);
    expect(isUnitEligible(unit(), 2, new Set(), 0)).toBe(true);
  });

  test('a unit only offered in semester 2 is not eligible for semester 1', () => {
    expect(isUnitEligible(unit({ offeringSemesters: [2] }), 1, new Set(), 0)).toBe(false);
    expect(isUnitEligible(unit({ offeringSemesters: [2] }), 2, new Set(), 0)).toBe(true);
  });

  test('a prerequisite must already be completed or in progress', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]] });
    expect(isUnitEligible(u, 1, new Set(), 0)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(['BASE']), 0)).toBe(true);
  });

  // v1 doesn't resolve corequisites among candidates picked in the same round, that would need the same
  // iterative fixed-point loop buildCustomPlan() uses across multiple semesters, out of scope for a single
  // target-semester check. A corequisite therefore behaves the same as a prerequisite here, it must already
  // be completed or in progress, it can't be satisfied by another candidate picked in this same run.
  test('a corequisite must also already be completed or in progress, same as a prerequisite in v1', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'corequisite', unitCode: 'PAIR' }]] });
    expect(isUnitEligible(u, 1, new Set(), 0)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(['PAIR']), 0)).toBe(true);
  });

  test('an antirequisite blocks the unit if the conflicting code is present', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'antirequisite', unitCode: 'OLD' }]] });
    expect(isUnitEligible(u, 1, new Set(['OLD']), 0)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(), 0)).toBe(true);
  });

  test('a credit_points condition checks the flat total', () => {
    const u = unit({ requisiteGroups: [[{ type: 'credit_points', creditPoints: 50 }]] });
    expect(isUnitEligible(u, 1, new Set(), 37.5)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(), 50)).toBe(true);
  });

  test('OR-of-AND groups: eligible if any single group is fully satisfied', () => {
    const u = unit({
      requisiteGroups: [
        [{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'MISSING' }],
        [{ type: 'credit_points', creditPoints: 25 }],
      ],
    });
    expect(isUnitEligible(u, 1, new Set(), 25)).toBe(true);
    expect(isUnitEligible(u, 1, new Set(), 0)).toBe(false);
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
