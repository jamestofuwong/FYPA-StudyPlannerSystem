// ============================================================
// Tests for core/services/classEstimation/plannerCache.ts.
// This is the shared per-run cache for plannerRepository.getPlannerById(), used by
// plannerCandidateResolver.ts, eligibilityEngine.ts, and unitRanker.ts so the same matched planner isn't
// fetched from the database independently by all three for every student.
// ============================================================

import { getCachedPlannerById, resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

describe('plannerCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
  });

  test('fetches a planner from the repository on first call', async () => {
    getPlannerById.mockResolvedValue({ id: 'p1' } as never);
    const result = await getCachedPlannerById('p1');
    expect(result).toEqual({ id: 'p1' });
    expect(getPlannerById).toHaveBeenCalledTimes(1);
    expect(getPlannerById).toHaveBeenCalledWith('p1');
  });

  test('returns the cached result on a second call for the same plannerId, without refetching', async () => {
    getPlannerById.mockResolvedValue({ id: 'p1' } as never);
    await getCachedPlannerById('p1');
    await getCachedPlannerById('p1');
    expect(getPlannerById).toHaveBeenCalledTimes(1);
  });

  test('fetches independently for a different plannerId', async () => {
    getPlannerById.mockResolvedValue({ id: 'whatever' } as never);
    await getCachedPlannerById('p1');
    await getCachedPlannerById('p2');
    expect(getPlannerById).toHaveBeenCalledTimes(2);
  });

  test('resetPlannerCache clears the cache, so the next call refetches', async () => {
    getPlannerById.mockResolvedValue({ id: 'p1' } as never);
    await getCachedPlannerById('p1');
    resetPlannerCache();
    await getCachedPlannerById('p1');
    expect(getPlannerById).toHaveBeenCalledTimes(2);
  });

  // The cache stores the in-flight Promise itself, not just the resolved value, so two calls that overlap
  // before the first one resolves still only trigger one underlying fetch.
  test('concurrent calls for the same plannerId before the first resolves still only fetch once', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    getPlannerById.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }) as never);

    const first = getCachedPlannerById('p1');
    const second = getCachedPlannerById('p1');
    resolveFetch({ id: 'p1' });

    await Promise.all([first, second]);
    expect(getPlannerById).toHaveBeenCalledTimes(1);
  });
});
