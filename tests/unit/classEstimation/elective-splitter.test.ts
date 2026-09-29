// ============================================================
// Tests for core/services/classEstimation/electiveSplitter.ts, Phase 6.
//
// The property worth guarding hardest is conservation: whatever seats a student is given for a pool must add
// up to exactly that many across the pool's units, however the weighting falls. If that drifts, the
// aggregated headcount drifts with it and nothing downstream would notice, because there is no separate
// figure to check it against.
//
// Everything else here is about the weighting behaving sensibly at the edges: a pool nobody has touched, a
// pool with one runaway favourite, a student with no load left, and a pool the eligibility filter emptied.
// ============================================================

import {
  buildElectivePopularity,
  splitElectivePicks,
} from '@core/services/classEstimation/electiveSplitter';
import type {
  CandidateUnit,
  EstimationRecord,
  RankedCandidateUnit,
} from '@shared/types/classEstimation';

const prescribed = (code: string, slots = 1): CandidateUnit => ({
  code, category: 'prescribed', poolSlotsRemaining: slots,
});

const freeElective = (code: string, slots = 1): CandidateUnit => ({
  code, category: 'freeElective', poolSlotsRemaining: slots,
});

const core = (code: string): RankedCandidateUnit => ({ code, category: 'core', yearLevel: 1, semester: 1 });

/** Total of every expected seat, which is what has to match the seats handed out. */
const total = (expectations: Array<{ expectedSeats: number }>) =>
  expectations.reduce((sum, e) => sum + e.expectedSeats, 0);

function record(completed: string[]): EstimationRecord {
  return { rawInput: { completedUnitCodes: completed } } as EstimationRecord;
}

describe('buildElectivePopularity', () => {
  test('counts how many students have each unit', () => {
    const popularity = buildElectivePopularity([
      record(['COS30020', 'COS30019']),
      record(['COS30020']),
      record(['COS30020', 'TNE30009']),
    ]);

    expect(popularity.get('COS30020')).toBe(3);
    expect(popularity.get('COS30019')).toBe(1);
    expect(popularity.get('TNE30009')).toBe(1);
    expect(popularity.get('COS99999')).toBeUndefined();
  });

  test('matches codes regardless of case or surrounding spaces', () => {
    const popularity = buildElectivePopularity([record([' cos30020 ']), record(['COS30020'])]);
    expect(popularity.get('COS30020')).toBe(2);
  });

  test('an empty batch produces an empty lookup rather than throwing', () => {
    expect(buildElectivePopularity([]).size).toBe(0);
  });
});

describe('splitElectivePicks', () => {
  const noPopularity = new Map<string, number>();

  // The invariant the aggregated headcount depends on.
  test('the shares add up to exactly the seats given out', () => {
    const pool = [prescribed('E1'), prescribed('E2'), prescribed('E3')];
    const popularity = new Map([['E1', 7], ['E2', 1]]);

    const split = splitElectivePicks(pool, [], 4, popularity);

    expect(split.prescribedSeats).toBe(1);
    expect(total(split.expectations)).toBeCloseTo(1, 10);
  });

  test('a pool nobody has taken is split evenly', () => {
    const pool = [prescribed('E1'), prescribed('E2'), prescribed('E3'), prescribed('E4')];

    const split = splitElectivePicks(pool, [], 4, noPopularity);

    for (const expectation of split.expectations) {
      expect(expectation.expectedSeats).toBeCloseTo(0.25, 10);
    }
    expect(total(split.expectations)).toBeCloseTo(1, 10);
  });

  // Add-one smoothing: a popular unit leads, but a new elective is never written off as drawing nobody.
  test('a popular unit gets the largest share and an untouched one still gets some', () => {
    const pool = [prescribed('POPULAR'), prescribed('NEW')];
    const popularity = new Map([['POPULAR', 9]]);

    const split = splitElectivePicks(pool, [], 4, popularity);
    const byCode = new Map(split.expectations.map((e) => [e.code, e.expectedSeats]));

    // Weights are 10 and 1, so 10/11 against 1/11.
    expect(byCode.get('POPULAR')).toBeCloseTo(10 / 11, 10);
    expect(byCode.get('NEW')).toBeCloseTo(1 / 11, 10);
    expect(byCode.get('NEW')).toBeGreaterThan(0);
  });

  test('the reported popularity is the raw count, not the smoothed weight', () => {
    const split = splitElectivePicks([prescribed('E1'), prescribed('E2')], [], 4, new Map([['E1', 5]]));
    const byCode = new Map(split.expectations.map((e) => [e.code, e.popularity]));

    expect(byCode.get('E1')).toBe(5);
    expect(byCode.get('E2')).toBe(0);
  });

  test('a student owing several slots spreads that many seats', () => {
    const pool = [prescribed('E1', 3), prescribed('E2', 3), prescribed('E3', 3)];

    const split = splitElectivePicks(pool, [], 4, noPopularity);

    expect(split.prescribedSeats).toBe(3);
    expect(total(split.expectations)).toBeCloseTo(3, 10);
    for (const expectation of split.expectations) {
      expect(expectation.expectedSeats).toBeCloseTo(1, 10);
    }
  });

  // ---- The load cap ----------------------------------------------------------------------------

  test('named core units eat into the load before electives get any', () => {
    const pool = [prescribed('E1', 4), prescribed('E2', 4)];

    const split = splitElectivePicks(pool, [core('C1'), core('C2'), core('C3')], 4, noPopularity);

    // Three of four slots are already taken by named units, so only one elective seat is left.
    expect(split.prescribedSeats).toBe(1);
    expect(total(split.expectations)).toBeCloseTo(1, 10);
  });

  test('a student whose load is already full contributes no elective seats', () => {
    const pool = [prescribed('E1', 2)];

    const split = splitElectivePicks(pool, [core('C1'), core('C2'), core('C3'), core('C4')], 4, noPopularity);

    expect(split.prescribedSeats).toBe(0);
    expect(split.expectations).toEqual([]);
    expect(split.unplacedSeats).toBe(0);   // no load for them, so nothing is owed next semester
  });

  test('seats never exceed what the student actually owes', () => {
    const pool = [prescribed('E1', 1), prescribed('E2', 1)];

    const split = splitElectivePicks(pool, [], 4, noPopularity);

    expect(split.prescribedSeats).toBe(1);   // one slot owed, three spare load, still one seat
    expect(total(split.expectations)).toBeCloseTo(1, 10);
  });

  // ---- Prescribed ahead of free elective -------------------------------------------------------

  test('prescribed is served first when both compete for the last of the load', () => {
    const pool = [prescribed('P1', 2), freeElective('F1', 2)];

    const split = splitElectivePicks(pool, [core('C1'), core('C2'), core('C3')], 4, noPopularity);

    expect(split.prescribedSeats).toBe(1);
    expect(split.freeElectiveSeats).toBe(0);
    expect(split.expectations.map((e) => e.code)).toEqual(['P1']);
  });

  test('both categories are served when there is load for both, each from its own pool', () => {
    const pool = [prescribed('P1'), prescribed('P2'), freeElective('F1'), freeElective('F2')];

    const split = splitElectivePicks(pool, [], 4, noPopularity);

    expect(split.prescribedSeats).toBe(1);
    expect(split.freeElectiveSeats).toBe(1);
    expect(total(split.expectations.filter((e) => e.category === 'prescribed'))).toBeCloseTo(1, 10);
    expect(total(split.expectations.filter((e) => e.category === 'freeElective'))).toBeCloseTo(1, 10);
  });

  // ---- Nothing to place ------------------------------------------------------------------------

  // A student owing slots with an empty eligible pool is a real situation, every option ruled out by
  // requisites or by not running next semester. Reported, because a quietly smaller estimate hides it.
  test('seats owed with an empty pool are reported as unplaced', () => {
    const owedButNothingEligible: CandidateUnit[] = [
      { code: 'X', category: 'core' },   // a core candidate carries no pool slots
    ];

    const split = splitElectivePicks(owedButNothingEligible, [], 4, noPopularity);

    expect(split.expectations).toEqual([]);
    expect(split.prescribedSeats).toBe(0);
    expect(split.unplacedSeats).toBe(0);
  });

  test('a student owing nothing gets no expectations', () => {
    const split = splitElectivePicks([prescribed('E1', 0), prescribed('E2', 0)], [], 4, noPopularity);

    expect(split.expectations).toEqual([]);
    expect(split.prescribedSeats).toBe(0);
    expect(split.freeElectiveSeats).toBe(0);
  });

  test('a duplicated pool unit is only counted once', () => {
    const split = splitElectivePicks([prescribed('E1'), prescribed('E1'), prescribed('E2')], [], 4, noPopularity);

    expect(split.expectations.map((e) => e.code).sort()).toEqual(['E1', 'E2']);
    expect(total(split.expectations)).toBeCloseTo(1, 10);
  });

  // ---- The point of the whole approach ---------------------------------------------------------
  //
  // No single student's prediction is right, since nobody can say which elective they will pick. What has to
  // hold is that a cohort's fractions land near the real spread. Ten students each owing one slot from a
  // three-unit pool must add up to ten seats, distributed in the popularity ratio.
  test('a cohort of identical students adds up to one seat each, spread by popularity', () => {
    const pool = [prescribed('A'), prescribed('B'), prescribed('C')];
    const popularity = new Map([['A', 3], ['B', 1]]);   // weights 4, 2, 1

    const perUnit = new Map<string, number>();
    for (let student = 0; student < 10; student++) {
      for (const expectation of splitElectivePicks(pool, [], 4, popularity).expectations) {
        perUnit.set(expectation.code, (perUnit.get(expectation.code) ?? 0) + expectation.expectedSeats);
      }
    }

    expect([...perUnit.values()].reduce((sum, n) => sum + n, 0)).toBeCloseTo(10, 8);
    expect(perUnit.get('A')).toBeCloseTo(10 * (4 / 7), 8);
    expect(perUnit.get('B')).toBeCloseTo(10 * (2 / 7), 8);
    expect(perUnit.get('C')).toBeCloseTo(10 * (1 / 7), 8);
  });
});
