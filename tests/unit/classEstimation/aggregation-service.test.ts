// ============================================================
// Tests for core/services/classEstimation/aggregationService.ts, Phase 8.
//
// This is the last step before a number reaches the HoD, so the tests are about order of operations. Two of
// them matter more than the rest:
//
//   Retention must discount the continuing cohort and NOT the manual new-intake figure. The HoD types what
//   they expect to actually arrive, so discounting it would cut the same no-shows twice.
//
//   Rounding must happen once, on the final figure. Rounding earlier would throw away elective shares, which
//   are routinely below 1, and a unit drawing 0.6 of a student from twenty of them is a real class.
// ============================================================

import {
  aggregate,
  totalsFor,
  roundHeadcount,
  type ContinuingContribution,
} from '@core/services/classEstimation/aggregationService';

const named = (code: string, n: number): ContinuingContribution => ({
  code, fromNamedPicks: n, fromElectives: 0,
});
const elective = (code: string, n: number): ContinuingContribution => ({
  code, fromNamedPicks: 0, fromElectives: n,
});

function run(overrides: Partial<Parameters<typeof aggregate>[0]> = {}) {
  return aggregate({
    continuing: [],
    newIntakeUnits: [],
    newIntakeCount: 0,
    retentionRate: 1,
    ...overrides,
  });
}

describe('aggregate', () => {
  test('adds named picks and elective shares for the same unit', () => {
    const [unit] = run({
      continuing: [named('COS10009', 40), elective('COS10009', 3.5)],
    });

    expect(unit.fromNamedPicks).toBe(40);
    expect(unit.fromElectives).toBe(3.5);
    expect(unit.continuingBeforeRetention).toBe(43.5);
  });

  test('discounts the continuing cohort by the retention rate', () => {
    const [unit] = run({ continuing: [named('COS10009', 100)], retentionRate: 0.85 });

    expect(unit.continuingBeforeRetention).toBe(100);
    expect(unit.continuingProjected).toBeCloseTo(85, 10);
    expect(unit.projected).toBeCloseTo(85, 10);
    expect(unit.headcount).toBe(85);
  });

  // The rule the whole ordering exists for.
  test('the new-intake figure is NOT discounted by retention', () => {
    const [unit] = run({
      newIntakeUnits: ['COS10009'],
      newIntakeCount: 60,
      retentionRate: 0.85,
    });

    expect(unit.fromNewIntake).toBe(60);
    expect(unit.projected).toBe(60);      // not 51
    expect(unit.headcount).toBe(60);
  });

  test('a unit taken by both cohorts discounts only the continuing half', () => {
    const [unit] = run({
      continuing: [named('COS10025', 100)],
      newIntakeUnits: ['COS10025'],
      newIntakeCount: 60,
      retentionRate: 0.85,
    });

    expect(unit.continuingProjected).toBeCloseTo(85, 10);
    expect(unit.fromNewIntake).toBe(60);
    expect(unit.projected).toBeCloseTo(145, 10);   // 85 continuing + 60 new, not 136
  });

  test('new intake lands on every one of its units', () => {
    const units = run({
      newIntakeUnits: ['COS10003', 'COS10009', 'COS10026'],
      newIntakeCount: 60,
    });

    expect(units).toHaveLength(3);
    for (const unit of units) expect(unit.fromNewIntake).toBe(60);
  });

  test('a unit only some majors start with gets its share of the new students', async () => {
    const units = run({
      newIntakeUnits: ['SHARED', 'SOME'],
      newIntakeShares: { SHARED: 1, SOME: 0.6 },
      newIntakeCount: 60,
    });
    const byCode = new Map(units.map((u) => [u.code, u]));

    expect(byCode.get('SHARED')!.fromNewIntake).toBe(60);
    expect(byCode.get('SOME')!.fromNewIntake).toBeCloseTo(36, 10);
  });

  // A duplicated code in the unit list must not charge the intake twice.
  test('a repeated new-intake unit is only counted once', () => {
    const units = run({ newIntakeUnits: ['COS10009', 'COS10009'], newIntakeCount: 60 });

    expect(units).toHaveLength(1);
    expect(units[0].fromNewIntake).toBe(60);
  });

  test('a negative new-intake figure is treated as none', () => {
    const units = run({ newIntakeUnits: ['COS10009'], newIntakeCount: -50 });
    expect(units).toEqual([]);
  });

  test('no new intake means no new-intake rows at all', () => {
    const units = run({ newIntakeUnits: ['COS10009'], newIntakeCount: 0 });
    expect(units).toEqual([]);
  });

  // ---- Rounding ---------------------------------------------------------------------------------

  // Elective shares are routinely well under 1. Rounding them as they are counted would throw away a class
  // that twenty students each have a 0.6 chance of taking.
  test('fractional shares survive to be summed before rounding', () => {
    const units = run({
      continuing: Array.from({ length: 20 }, () => elective('INF10024', 0.6)),
    });

    expect(units[0].continuingBeforeRetention).toBeCloseTo(12, 10);
    expect(units[0].headcount).toBe(12);
  });

  test.each([
    [0.4, 0],
    [0.5, 1],
    [1.49, 1],
    [1.5, 2],
    [84.6, 85],
  ])('a projection of %p rounds to %p', (projected, expected) => {
    expect(roundHeadcount(projected)).toBe(expected);
  });

  test('a unit nobody is predicted into rounds to zero rather than disappearing', () => {
    const [unit] = run({ continuing: [elective('COS20083', 0.2)] });

    expect(unit.headcount).toBe(0);
    expect(unit.projected).toBeCloseTo(0.2, 10);   // the real figure is still there to inspect
  });

  // ---- Ordering and shape -----------------------------------------------------------------------

  test('units come back largest first', () => {
    const units = run({
      continuing: [named('SMALL', 5), named('BIG', 100), named('MID', 40)],
    });

    expect(units.map((u) => u.code)).toEqual(['BIG', 'MID', 'SMALL']);
  });

  test('units projecting the same figure are ordered by code, so a run is reproducible', () => {
    const units = run({ continuing: [named('COS20007', 10), named('COS10009', 10)] });
    expect(units.map((u) => u.code)).toEqual(['COS10009', 'COS20007']);
  });

  test('an empty cohort with no intake produces nothing', () => {
    expect(run()).toEqual([]);
  });

  test('a retention rate of zero leaves only the new intake', () => {
    const units = run({
      continuing: [named('COS20007', 100)],
      newIntakeUnits: ['COS10009'],
      newIntakeCount: 60,
      retentionRate: 0,
    });

    const byCode = new Map(units.map((u) => [u.code, u]));
    expect(byCode.get('COS20007')!.headcount).toBe(0);
    expect(byCode.get('COS10009')!.headcount).toBe(60);
  });
});

describe('totalsFor', () => {
  test('reports the fractional and rounded totals separately', () => {
    const units = run({
      continuing: [named('A', 10), elective('B', 0.5), elective('C', 0.5)],
    });

    const totals = totalsFor(units);
    expect(totals.units).toBe(3);
    expect(totals.projected).toBeCloseTo(11, 10);
    // A rounds to 10, B and C each round to 1: the rounded total overshoots, which is expected.
    expect(totals.headcount).toBe(12);
  });

  // The rounded per-unit figures are what the HoD staffs against, so each has to be its own best estimate
  // rather than adjusted to make a column add up. This pins that the two totals are allowed to differ.
  test('the rounded total is allowed to differ from the fractional one', () => {
    const units = run({ continuing: [elective('A', 0.5), elective('B', 0.5)] });
    const totals = totalsFor(units);

    expect(totals.projected).toBeCloseTo(1, 10);
    expect(totals.headcount).toBe(2);
  });

  test('counts the units predicted not to run', () => {
    const units = run({ continuing: [named('A', 10), elective('B', 0.2), elective('C', 0.1)] });

    expect(totalsFor(units).unitsWithNoStudents).toBe(2);
  });

  test('reports how much of the total came from new intake', () => {
    const units = run({
      continuing: [named('A', 100)],
      newIntakeUnits: ['B', 'C'],
      newIntakeCount: 60,
    });

    expect(totalsFor(units).fromNewIntake).toBe(120);
  });

  test('an empty result does not throw', () => {
    expect(totalsFor([])).toEqual({
      units: 0, unitsWithNoStudents: 0, projected: 0, headcount: 0, fromNewIntake: 0,
    });
  });
});
