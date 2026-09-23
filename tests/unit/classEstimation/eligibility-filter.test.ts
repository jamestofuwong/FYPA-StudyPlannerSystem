// ============================================================
// Tests for core/services/classEstimation/eligibilityFilter.ts.
// This is a thin wrapper applying eligibilityEngine's isUnitEligible() check across a whole candidate list
// for one student, so the coverage here focuses on the filtering contract itself (which candidates survive,
// which get dropped, and why), the underlying eligibility rules themselves are already covered in
// tests/unit/classEstimation/eligibility-engine.test.ts.
// ============================================================

import { filterEligibleUnits } from '@core/services/classEstimation/eligibilityFilter';
import { resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';
import type { CandidateUnit } from '@shared/types/classEstimation';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

describe('filterEligibleUnits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
  });

  test('keeps a candidate that is eligible (offered in the target semester, prerequisite met)', async () => {
    getPlannerById.mockResolvedValue({
      units: [{
        category: 'core',
        unit: {
          unit_code: 'COS20015', unit_name: 'Databases',
          offerings: [{ offered_in: 1 }],
          requisite_groups: [{
            conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: 'COS10009' } }],
          }],
        },
      }],
      elective_groups: [],
    } as never);

    const candidates: CandidateUnit[] = [{ code: 'COS20015', category: 'core' }];
    const result = await filterEligibleUnits(candidates, 'p1', 1, new Set(['COS10009']), 12.5);

    expect(result).toEqual(candidates);
  });

  test('drops a candidate whose prerequisite is not met', async () => {
    getPlannerById.mockResolvedValue({
      units: [{
        category: 'core',
        unit: {
          unit_code: 'COS20015', unit_name: 'Databases', offerings: [],
          requisite_groups: [{
            conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: 'COS10009' } }],
          }],
        },
      }],
      elective_groups: [],
    } as never);

    const result = await filterEligibleUnits([{ code: 'COS20015', category: 'core' }], 'p1', 1, new Set(), 0);
    expect(result).toEqual([]);
  });

  test('drops a candidate not offered in the target semester', async () => {
    getPlannerById.mockResolvedValue({
      units: [{ category: 'core', unit: { unit_code: 'U1', unit_name: 'X', offerings: [{ offered_in: 2 }], requisite_groups: [] } }],
      elective_groups: [],
    } as never);

    const result = await filterEligibleUnits([{ code: 'U1', category: 'core' }], 'p1', 1, new Set(), 0);
    expect(result).toEqual([]);
  });

  // A candidate code the matched planner has no record of (shouldn't normally happen, candidates are
  // sourced from that same planner's own data) can't be verified against anything, so it's dropped rather
  // than assumed eligible.
  test('drops a candidate the planner has no record of at all', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);
    const result = await filterEligibleUnits([{ code: 'UNKNOWN', category: 'core' }], 'p1', 1, new Set(), 0);
    expect(result).toEqual([]);
  });

  test('filters a mixed list, keeping only the eligible ones and preserving their order', async () => {
    getPlannerById.mockResolvedValue({
      units: [
        { category: 'core', unit: { unit_code: 'OK', unit_name: 'X', offerings: [], requisite_groups: [] } },
        { category: 'core', unit: { unit_code: 'BLOCKED', unit_name: 'Y', offerings: [{ offered_in: 2 }], requisite_groups: [] } },
      ],
      elective_groups: [],
    } as never);

    const result = await filterEligibleUnits(
      [{ code: 'OK', category: 'core' }, { code: 'BLOCKED', category: 'core' }],
      'p1', 1, new Set(), 0,
    );

    expect(result).toEqual([{ code: 'OK', category: 'core' }]);
  });
});
