// ============================================================
// Tests for core/services/classEstimation/plannerCandidateResolver.ts.
// Core/majorCore candidates come straight from the match result's own missingUnits lists. Prescribed and
// freeElective have no missingUnits list at all (they're pool-based categories), only a missingSlots count,
// so this resolver has to go fetch the real candidate pool from the matched planner itself. Both DB-reading
// paths are covered here, plus the null-result cases (no major detected, planner no longer exists).
// ============================================================

import { resolveCandidateUnits } from '@core/services/classEstimation/plannerCandidateResolver';
import { resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';
import type { MatchingServiceResult } from '@core/services/matching/matchingService';

jest.mock('@core/db/repositories/plannerRepository');

const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

function breakdown(overrides: any = {}) {
  return {
    core: { matched: 0, required: 0, missingUnits: [] },
    majorCore: { matched: 0, required: 0, missingUnits: [] },
    prescribed: { matched: 0, required: 0, missingSlots: 0 },
    freeElective: { matched: 0, required: 0, missingSlots: 0 },
    wil: { matched: 0, required: 1 },
    ...overrides,
  };
}

function matchResult(opts: { noMajor?: boolean; plannerID?: string; breakdown?: any } = {}): MatchingServiceResult {
  const primaryMajor = opts.noMajor ? null : { breakdown: opts.breakdown ?? breakdown() };
  return {
    durationMs: 0,
    payload: {
      studentID: 'S1',
      courseType: 'degree',
      status: primaryMajor ? 'detected' : 'noMajorDetected',
      isOverride: false,
      primaryMajor,
      secondMajor: null,
      topAlternatives: [],
      detectedMinors: [],
      rankedPlanners: primaryMajor ? [{ plannerID: opts.plannerID ?? 'p1' }] : [],
      unavailableUnits: [],
    },
  } as never;
}

describe('resolveCandidateUnits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
  });

  test('returns null when no major was detected, without touching the database', async () => {
    const result = await resolveCandidateUnits(matchResult({ noMajor: true }), []);
    expect(result).toBeNull();
    expect(getPlannerById).not.toHaveBeenCalled();
  });

  test('returns null when the matched planner no longer exists in the DB', async () => {
    getPlannerById.mockResolvedValue(null as never);
    const result = await resolveCandidateUnits(matchResult(), []);
    expect(result).toBeNull();
  });

  test('includes missing core and major core units directly, they are not re-filtered against completed here', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({
        core: { matched: 1, required: 2, missingUnits: ['COS10009'] },
        majorCore: { matched: 0, required: 1, missingUnits: ['COS20015'] },
      }) }),
      ['COS10009'],
    );

    expect(result?.candidates).toEqual([
      { code: 'COS10009', category: 'core' },
      { code: 'COS20015', category: 'majorCore' },
    ]);
  });

  test('resolves the prescribed pool from elective_groups, excluding completed units', async () => {
    getPlannerById.mockResolvedValue({
      units: [],
      elective_groups: [
        { units: [{ unit: { unit_code: 'COS40006' } }, { unit: { unit_code: 'COS40007' } }] },
      ],
    } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({ prescribed: { matched: 0, required: 2, missingSlots: 2 } }) }),
      ['COS40006'],
    );

    expect(result?.candidates).toEqual([
      { code: 'COS40007', category: 'prescribed', poolSlotsRemaining: 2 },
    ]);
  });

  test('resolves the free elective pool from slotted TemplateUnit rows with category elective', async () => {
    getPlannerById.mockResolvedValue({
      units: [
        { category: 'elective', unit: { unit_code: 'COS30001' } },
        { category: 'core', unit: { unit_code: 'COS10009' } },
      ],
      elective_groups: [],
    } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({ freeElective: { matched: 0, required: 1, missingSlots: 1 } }) }),
      [],
    );

    expect(result?.candidates).toEqual([
      { code: 'COS30001', category: 'freeElective', poolSlotsRemaining: 1 },
    ]);
  });

  test('skips prescribed/free-elective pool resolution entirely when their missingSlots is 0', async () => {
    getPlannerById.mockResolvedValue({
      units: [{ category: 'elective', unit: { unit_code: 'COS30001' } }],
      elective_groups: [{ units: [{ unit: { unit_code: 'COS40006' } }] }],
    } as never);

    const result = await resolveCandidateUnits(matchResult(), []);
    expect(result?.candidates).toEqual([]);
  });

  test('returns the matched plannerId alongside the candidates', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);
    const result = await resolveCandidateUnits(matchResult({ plannerID: 'p-xyz' }), []);
    expect(result?.plannerId).toBe('p-xyz');
  });
});
