// ============================================================
// Tests for core/services/classEstimation/newIntakeResolver.ts, Phase 8.
//
// Two things here are easy to get wrong and impossible to notice afterwards.
//
// The intake being estimated usually has no planners loaded, because planners are imported shortly before an
// intake rather than years ahead. Estimating semester 1 of 2027 today finds nothing for 2027, so it has to
// fall back and say so. Silently returning no units would drop the new-intake figure from the estimate
// entirely and the total would just look a bit low.
//
// Slot semesters count from the planner's own intake, not the calendar, and twenty of the forty-five loaded
// planners are September intakes. Comparing a raw slot number against the target term would give every one
// of those cohorts the wrong semester's units.
// ============================================================

import { resolveNewIntakeUnits } from '@core/services/classEstimation/newIntakeResolver';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository');

const getAllPlannersWithUnits = jest.mocked(plannerRepository.getAllPlannersWithUnits);

/** A planner with one unit per (year, semester, code) triple given. */
function planner(
  intakeYear: number,
  intakeMonth: number,
  units: Array<[string, number, number] | [string, number, number, string]>,
) {
  return {
    intake_year: intakeYear,
    intake_month: intakeMonth,
    units: units.map(([code, yearLevel, semester, category]) => ({
      category: category ?? 'core',
      year_level: yearLevel,
      semester,
      unit: { unit_code: code },
    })),
  };
}

const y1s1 = (code: string) => [code, 1, 1] as [string, number, number];
const y1s2 = (code: string) => [code, 1, 2] as [string, number, number];

describe('resolveNewIntakeUnits', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the units every major puts in a new student\'s first semester', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 3, [y1s1('COS10009'), y1s1('COS10003'), y1s2('COS20007')]),
      planner(2027, 3, [y1s1('COS10009'), y1s1('COS10003'), y1s2('COS30015')]),
    ] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.codes).toEqual(['COS10003', 'COS10009']);
    expect(result.basedOnIntakeYear).toBe(2027);
    expect(result.warnings).toEqual([]);
  });

  // A unit only one major puts in year 1 semester 1 cannot be charged to students who have not picked that
  // major, so it is left out and the omission is reported.
  test('a unit only some majors take is left out, and said so', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 3, [y1s1('SHARED'), y1s1('AI_ONLY')]),
      planner(2027, 3, [y1s1('SHARED')]),
    ] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.codes).toEqual(['SHARED']);
    expect(result.warnings.some((w) => /extra units/i.test(w))).toBe(true);
  });

  test('later years are never a new student\'s first semester', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 3, [y1s1('FIRST'), ['SECOND_YEAR', 2, 1], ['THIRD_YEAR', 3, 1]]),
    ] as never);

    expect((await resolveNewIntakeUnits(2027, 1)).codes).toEqual(['FIRST']);
  });

  // MPU units are compulsory but sit outside the estimate everywhere else in this module, so counting them
  // here would make new intake the only place they ever appear.
  test('MPU units are excluded', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 3, [y1s1('COS10009'), ['MPU3273', 1, 1, 'mpu']]),
    ] as never);

    expect((await resolveNewIntakeUnits(2027, 1)).codes).toEqual(['COS10009']);
  });

  test('a summer or winter slot is never a first semester', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 3, [y1s1('COS10009'), ['MPU3212', 1, 4], ['SUMMER', 1, 3]]),
    ] as never);

    expect((await resolveNewIntakeUnits(2027, 1)).codes).toEqual(['COS10009']);
  });

  // ---- The intake conversion --------------------------------------------------------------------

  // A September cohort's "semester 1" is calendar semester 2, so their first semester belongs to a calendar
  // semester 2 estimate, not a semester 1 one.
  test('a September intake\'s first semester counts as calendar semester 2', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 9, [y1s1('SEPT_FIRST'), y1s2('SEPT_SECOND')]),
    ] as never);

    expect((await resolveNewIntakeUnits(2027, 2)).codes).toEqual(['SEPT_FIRST']);
    expect((await resolveNewIntakeUnits(2027, 1)).codes).toEqual(['SEPT_SECOND']);
  });

  test('a February intake\'s first semester counts as calendar semester 1', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 2, [y1s1('FEB_FIRST'), y1s2('FEB_SECOND')]),
    ] as never);

    expect((await resolveNewIntakeUnits(2027, 1)).codes).toEqual(['FEB_FIRST']);
    expect((await resolveNewIntakeUnits(2027, 2)).codes).toEqual(['FEB_SECOND']);
  });

  // ---- Falling back ------------------------------------------------------------------------------

  // The normal case in practice: nothing is loaded for the intake being estimated.
  test('falls back to the most recent matching intake and warns', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2025, 3, [y1s1('OLD')]),
      planner(2026, 3, [y1s1('RECENT')]),
    ] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.codes).toEqual(['RECENT']);
    expect(result.basedOnIntakeYear).toBe(2026);
    expect(result.warnings.some((w) => /No planner is loaded for the 2027 semester 1 intake/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /curriculum change/i.test(w))).toBe(true);
  });

  // The two semesters of an intake carry different first-semester units, so the same semester in an older
  // year beats a nearer year in the other semester.
  test('the same semester in an older year beats a nearer year in the other semester', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2024, 3, [y1s1('S1_2024')]),
      planner(2026, 9, [y1s1('S2_2026')]),
    ] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.codes).toEqual(['S1_2024']);
    expect(result.basedOnIntakeSemester).toBe(1);
  });

  test('falls back to the other semester only when there is nothing else, and says so twice', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2026, 9, [y1s1('SEPT_ONLY')]),
    ] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.basedOnIntakeSemester).toBe(2);
    expect(result.warnings.some((w) => /may differ/i.test(w))).toBe(true);
  });

  // ---- Nothing to work with ----------------------------------------------------------------------

  test('no planners at all is reported, not returned as an empty success', async () => {
    getAllPlannersWithUnits.mockResolvedValue([] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.codes).toEqual([]);
    expect(result.warnings.some((w) => /No planners are loaded/.test(w))).toBe(true);
  });

  // If the majors share nothing, the new-intake figure has nowhere to go. Saying so beats a total that is
  // quietly short by the whole new cohort.
  test('majors sharing no first-semester units is reported', async () => {
    getAllPlannersWithUnits.mockResolvedValue([
      planner(2027, 3, [y1s1('A_ONLY')]),
      planner(2027, 3, [y1s1('B_ONLY')]),
    ] as never);

    const result = await resolveNewIntakeUnits(2027, 1);

    expect(result.codes).toEqual([]);
    expect(result.warnings.some((w) => /nowhere to go/i.test(w))).toBe(true);
  });

  test('a planner with no units contributes nothing and does not throw', async () => {
    getAllPlannersWithUnits.mockResolvedValue([planner(2027, 3, [])] as never);

    expect((await resolveNewIntakeUnits(2027, 1)).codes).toEqual([]);
  });
});
