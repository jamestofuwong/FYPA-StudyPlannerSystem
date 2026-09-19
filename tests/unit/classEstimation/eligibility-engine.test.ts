// ============================================================
// Tests for core/services/classEstimation/eligibilityEngine.ts.
// This is the forward-looking "can this student take unit X next semester" check.
// checkRequisites() in profileBuilder.ts only validates units already completed. 
// isUnitEligible() is pure and tested directly with hand-built fixtures; buildEligibilityUnitsFromPlanner() reads from
// plannerRepository.getPlannerById(), which is mocked here.
// ============================================================

import {
  isUnitEligible,
  buildEligibilityUnitsFromPlanner,
  type EligibilityUnit,
} from '@core/services/classEstimation/eligibilityEngine';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

function unit(overrides: Partial<EligibilityUnit> = {}): EligibilityUnit {
  return { unitCode: 'U1', offeringSemesters: [], requisiteGroups: [], ...overrides };
}

describe('isUnitEligible', () => {
  // Mirrors customPlannerScheduler.ts's rule: a unit with no offering rows at all is treated as available every semester.
  test('a unit with no offering rows is available in any semester', () => {
    expect(isUnitEligible(unit(), 1, new Set(), 0)).toBe(true);
    expect(isUnitEligible(unit(), 2, new Set(), 0)).toBe(true);
  });

  test('a unit only offered in semester 2 is not eligible for semester 1', () => {
    expect(isUnitEligible(unit({ offeringSemesters: [2] }), 1, new Set(), 0)).toBe(false);
    expect(isUnitEligible(unit({ offeringSemesters: [2] }), 2, new Set(), 0)).toBe(true);
  });

  test('a prerequisite must already be satisfied', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]] });
    expect(isUnitEligible(u, 1, new Set(), 0)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(['BASE']), 0)).toBe(true);
  });

  // satisfiedUnitCodes is meant to be completed-or-in-progress plus whatever else has already been picked 
  // earlier in the same estimation round, so a corequisite pair can satisfy each other in one pass.
  test('a corequisite is satisfied by a code in the same satisfied set (e.g. picked earlier this round)', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'corequisite', unitCode: 'PAIR' }]] });
    expect(isUnitEligible(u, 1, new Set(['PAIR']), 0)).toBe(true);
  });

  test('an antirequisite blocks the unit if the conflicting code is present', () => {
    const u = unit({ requisiteGroups: [[{ type: 'unit', requisiteType: 'antirequisite', unitCode: 'OLD' }]] });
    expect(isUnitEligible(u, 1, new Set(['OLD']), 0)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(), 0)).toBe(true);
  });

  // The DB's credit_points requisite type has no representation in the matching pipeline's own Requisite type, 
  // this engine reads it directly instead, so it needs its own coverage here.
  test('a credit_points condition checks the flat total', () => {
    const u = unit({ requisiteGroups: [[{ type: 'credit_points', creditPoints: 50 }]] });
    expect(isUnitEligible(u, 1, new Set(), 37.5)).toBe(false);
    expect(isUnitEligible(u, 1, new Set(), 50)).toBe(true);
  });

  // requisiteGroups is OR of AND: only one group needs to be fully satisfied for the unit to be eligible.
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
  beforeEach(() => jest.clearAllMocks());

  test('returns an empty map when the planner does not exist', async () => {
    getPlannerById.mockResolvedValue(null as never);
    expect(await buildEligibilityUnitsFromPlanner('missing')).toEqual(new Map());
  });

  // Both slotted TemplateUnit rows and elective-group pool units are candidate categories for class estimation, 
  // so both need to end up in the lookup, not just the slotted ones.
  test('maps slotted units and elective-pool units into the lookup', async () => {
    getPlannerById.mockResolvedValue({
      units: [{
        unit: {
          unit_code: 'COS10009',
          offerings: [{ offered_in: 1 }],
          requisite_groups: [{
            conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: 'COS10001' } }],
          }],
        },
      }],
      elective_groups: [
        { units: [{ unit: { unit_code: 'COS40006', offerings: [], requisite_groups: [] } }] },
      ],
    } as never);

    const map = await buildEligibilityUnitsFromPlanner('p1');

    expect(map.get('COS10009')).toEqual({
      unitCode: 'COS10009',
      offeringSemesters: [1],
      requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'COS10001', creditPoints: undefined }]],
    });
    expect(map.has('COS40006')).toBe(true);
  });

  // Same "empty elective slot" case as plannerTemplateBuilder, 
  // a TemplateUnit row with no unit attached should be skipped, not crash.
  test('skips TemplateUnit rows with no linked unit', async () => {
    getPlannerById.mockResolvedValue({ units: [{ unit: null }], elective_groups: [] } as never);
    expect(await buildEligibilityUnitsFromPlanner('p1')).toEqual(new Map());
  });
});
