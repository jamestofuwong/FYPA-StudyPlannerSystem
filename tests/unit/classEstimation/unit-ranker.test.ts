// ============================================================
// Tests for core/services/classEstimation/unitRanker.ts.
// Core/majorCore candidates get ranked by (year_level, semester) from the matched planner's TemplateUnit
// rows and capped at loadCap. Prescribed/freeElective candidates are pool-based with no slot data, so they
// pass through untouched as poolCandidates for electiveSplitter.ts (Phase 4) to handle separately.
// ============================================================

import { rankAndCapUnits } from '@core/services/classEstimation/unitRanker';
import { resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';
import type { CandidateUnit } from '@shared/types/classEstimation';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

describe('rankAndCapUnits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
  });

  test('ranks core/majorCore candidates ascending by (year_level, semester)', async () => {
    getPlannerById.mockResolvedValue({
      units: [
        { year_level: 2, semester: 1, unit: { unit_code: 'LATER' } },
        { year_level: 1, semester: 2, unit: { unit_code: 'MIDDLE' } },
        { year_level: 1, semester: 1, unit: { unit_code: 'EARLIEST' } },
      ],
    } as never);

    const candidates: CandidateUnit[] = [
      { code: 'LATER', category: 'core' },
      { code: 'MIDDLE', category: 'majorCore' },
      { code: 'EARLIEST', category: 'core' },
    ];

    const result = await rankAndCapUnits(candidates, 'p1', 10);
    expect(result.picked.map((u) => u.code)).toEqual(['EARLIEST', 'MIDDLE', 'LATER']);
  });

  test('caps the picked list at loadCap, dropping the rest for this run', async () => {
    getPlannerById.mockResolvedValue({
      units: [
        { year_level: 1, semester: 1, unit: { unit_code: 'A' } },
        { year_level: 1, semester: 2, unit: { unit_code: 'B' } },
        { year_level: 2, semester: 1, unit: { unit_code: 'C' } },
      ],
    } as never);

    const candidates: CandidateUnit[] = [
      { code: 'A', category: 'core' }, { code: 'B', category: 'core' }, { code: 'C', category: 'core' },
    ];

    const result = await rankAndCapUnits(candidates, 'p1', 2);
    expect(result.picked.map((u) => u.code)).toEqual(['A', 'B']);
  });

  test('separates prescribed/freeElective candidates into poolCandidates, untouched by ranking or the cap', async () => {
    getPlannerById.mockResolvedValue({ units: [] } as never);

    const candidates: CandidateUnit[] = [
      { code: 'POOL1', category: 'prescribed', poolSlotsRemaining: 2 },
      { code: 'POOL2', category: 'freeElective', poolSlotsRemaining: 1 },
    ];

    const result = await rankAndCapUnits(candidates, 'p1', 0);
    expect(result.picked).toEqual([]);
    expect(result.poolCandidates).toEqual(candidates);
  });

  // Shouldn't normally happen for core/majorCore, but a candidate with no matching TemplateUnit row sorts
  // after every unit that does have a slot, since there's no ordering signal to place it earlier.
  test('a candidate with no known slot sorts after units that do have one', async () => {
    getPlannerById.mockResolvedValue({
      units: [{ year_level: 3, semester: 2, unit: { unit_code: 'HAS_SLOT' } }],
    } as never);

    const candidates: CandidateUnit[] = [
      { code: 'NO_SLOT', category: 'core' },
      { code: 'HAS_SLOT', category: 'core' },
    ];

    const result = await rankAndCapUnits(candidates, 'p1', 10);
    expect(result.picked.map((u) => u.code)).toEqual(['HAS_SLOT', 'NO_SLOT']);
  });
});
