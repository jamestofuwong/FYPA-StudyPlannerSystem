// ============================================================
// Tests for core/services/classEstimation/plannerCandidateResolver.ts.
// Core/majorCore candidates come straight from the match result's own missingUnits lists. Prescribed and
// freeElective have no missingUnits list at all (they're pool-based categories), only a missingSlots count,
// so this resolver has to go fetch the real candidate pool from the matched planner itself. Both DB-reading
// paths are covered here, plus the null-result cases (no major detected, planner no longer exists).
// ============================================================

import {
  resolveCandidateUnits,
  resolveCommonCoreUnits,
} from '@core/services/classEstimation/plannerCandidateResolver';
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

  test('includes the missing core and major core units', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({
        core: { matched: 1, required: 2, missingUnits: ['COS10009'] },
        majorCore: { matched: 0, required: 1, missingUnits: ['COS20015'] },
      }) }),
      [],
    );

    expect(result?.candidates).toEqual([
      { code: 'COS10009', category: 'core' },
      { code: 'COS20015', category: 'majorCore' },
    ]);
  });

  // The bug this guards against: scoringEngine.ts subtracts profile.completedCore, which is built from the
  // ONE global category unitMasterTableBuilder.ts resolved for a unit across every planner. COS20007 is core
  // in five planners and major_core in five others, so major_core wins globally and a student who passed it
  // has it counted in completedMajorCore, never completedCore. The matched planner's missingCore then still
  // lists it, and before this filter the student was told to enrol in a unit they had already passed.
  test('a completed unit is never a candidate, whatever category it was scored under', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({
        core: { matched: 1, required: 3, missingUnits: ['COS20007', 'TNE10006'] },
        majorCore: { matched: 0, required: 2, missingUnits: ['COS30049', 'SWE30003'] },
      }) }),
      ['COS20007', 'COS30049'],
    );

    expect(result?.candidates).toEqual([
      { code: 'TNE10006', category: 'core' },
      { code: 'SWE30003', category: 'majorCore' },
    ]);
  });

  // A failed unit is not in completedUnitCodes (resolveUnitStates marks it must_retake), so it stays a
  // candidate. That is the behaviour wanted: a retake is a real seat next semester.
  test('a unit awaiting a retake stays a candidate', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({
        core: { matched: 0, required: 1, missingUnits: ['COS10009'] },
      }) }),
      ['COS20007'],   // the failed COS10009 is absent from the completed list
    );

    expect(result?.candidates).toEqual([{ code: 'COS10009', category: 'core' }]);
  });

  test('completed codes match regardless of case or surrounding spaces', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCandidateUnits(
      matchResult({ breakdown: breakdown({
        core: { matched: 0, required: 1, missingUnits: ['COS20007'] },
      }) }),
      ['  cos20007 '],
    );

    expect(result?.candidates).toEqual([]);
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

// ====== Students with no detectable major ====================================================
//
// Every major in this course shares the same first-year units, so a student one or two semesters in has
// taken nothing that tells one major from another and no major can be detected. That is roughly a fifth of a
// real cohort. Dropping them undercounts the estimate; guessing a major predicts units they may never take.
// Neither is needed, because those students' remaining core units are the same whichever major they pick:
// all five planners at each intake require the identical 8 core units.
describe('resolveCommonCoreUnits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
  });

  function noMajorResult(rankedPlanners: Array<{ plannerID: string; missingCore: string[] }>): MatchingServiceResult {
    return {
      durationMs: 0,
      payload: {
        studentID: 'S1',
        courseType: 'degree',
        status: 'noMajorDetected',
        isOverride: false,
        primaryMajor: null,
        secondMajor: null,
        topAlternatives: [],
        detectedMinors: [],
        rankedPlanners,
        unavailableUnits: [],
      },
    } as never;
  }

  // Once other courses' planners are loaded, every planner for the intake is a candidate, Business included.
  // Business and Computer Science share no core units, so intersecting across both would leave a first-year
  // with nothing predicted. Only planners of the best match's own course are intersected.
  test('only planners of the same course as the student are intersected', async () => {
    const courseOf = (id: string) => (id.startsWith('bus') ? 'Bachelor of Business' : 'Bachelor of Computer Science');
    getPlannerById.mockImplementation(async (id: string) =>
      ({ units: [], elective_groups: [], course: { name: courseOf(id) } }) as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([
        { plannerID: 'cs-ai',    missingCore: ['COS10009', 'COS10025'] },
        { plannerID: 'cs-cyber', missingCore: ['COS10009', 'COS10025'] },
        { plannerID: 'bus-acc',  missingCore: ['BUS10001'] },
      ]),
      [],
    );

    expect(result?.candidates.map((c) => c.code)).toEqual(['COS10009', 'COS10025']);
  });

  test('proposes only the units every candidate planner still wants', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([
        { plannerID: 'ai',    missingCore: ['COS10009', 'COS20007', 'COS10025'] },
        { plannerID: 'cyber', missingCore: ['COS10009', 'COS20007', 'TNE10006'] },
        { plannerID: 'ds',    missingCore: ['COS10009', 'COS20007'] },
      ]),
      [],
    );

    // COS10025 and TNE10006 are each wanted by only one planner, so they are left out.
    expect(result?.candidates).toEqual([
      { code: 'COS10009', category: 'core' },
      { code: 'COS20007', category: 'core' },
    ]);
    expect(result?.basis).toBe('commonCore');
  });

  test('the best-scoring planner stands in for the eligibility lookup', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([
        { plannerID: 'best', missingCore: ['COS10009'] },
        { plannerID: 'next', missingCore: ['COS10009'] },
      ]),
      [],
    );

    expect(result?.plannerId).toBe('best');
    expect(getPlannerById).toHaveBeenCalledWith('best');
  });

  // Major core and the elective pools differ by major by definition, so proposing any of them would be a
  // guess. They come back on their own once the student is far enough in for a major to be detected.
  test('proposes nothing beyond core, whatever else the planner holds', async () => {
    getPlannerById.mockResolvedValue({
      units: [{ category: 'elective', unit: { unit_code: 'FREE1' } }],
      elective_groups: [{ units: [{ unit: { unit_code: 'POOL1' } }] }],
    } as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([{ plannerID: 'p1', missingCore: ['COS10009'] }]),
      [],
    );

    expect(result?.candidates.every((c) => c.category === 'core')).toBe(true);
    expect(result?.candidates.map((c) => c.code)).toEqual(['COS10009']);
  });

  test('a completed unit is never proposed', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([
        { plannerID: 'a', missingCore: ['COS10009', 'COS20007'] },
        { plannerID: 'b', missingCore: ['COS10009', 'COS20007'] },
      ]),
      ['  cos10009 '],
    );

    expect(result?.candidates).toEqual([{ code: 'COS20007', category: 'core' }]);
  });

  test('a single candidate planner means its whole remaining core is shared', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([{ plannerID: 'only', missingCore: ['COS10009', 'COS10004'] }]),
      [],
    );

    expect(result?.candidates.map((c) => c.code)).toEqual(['COS10004', 'COS10009']);
  });

  test('planners with nothing in common produce no candidates rather than an error', async () => {
    getPlannerById.mockResolvedValue({ units: [], elective_groups: [] } as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([
        { plannerID: 'a', missingCore: ['COS10009'] },
        { plannerID: 'b', missingCore: ['TNE10006'] },
      ]),
      [],
    );

    expect(result?.candidates).toEqual([]);
    expect(result?.basis).toBe('commonCore');
  });

  test('returns null when there are no candidate planners at all', async () => {
    const result = await resolveCommonCoreUnits(noMajorResult([]), []);

    expect(result).toBeNull();
    expect(getPlannerById).not.toHaveBeenCalled();
  });

  test('returns null when the stand-in planner is gone from the DB', async () => {
    getPlannerById.mockResolvedValue(null as never);

    const result = await resolveCommonCoreUnits(
      noMajorResult([{ plannerID: 'missing', missingCore: ['COS10009'] }]),
      [],
    );

    expect(result).toBeNull();
  });
});
