// ============================================================
// Tests for deriving the semester an estimate targets from the date.
//
// The case worth the most here is September to December: the next semester is semester 1 of the FOLLOWING
// year, so the year rolls over with it. That is the one a hand-picked term gets wrong, and getting it wrong
// means estimating against the wrong planner year without anything looking broken.
// ============================================================

import {
  describeAcademicNow,
  nextTargetTerm,
  formatTerm,
} from '@core/services/classEstimation/academicCalendar';

// Local noon, so a timezone offset can never push a date into the neighbouring day and month.
const on = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

describe('describeAcademicNow', () => {
  // Semester 1 runs March to early July, semester 2 September to early December.
  test.each([
    ['15 Jan 2026', on(2026, 1, 15), null,                       { year: 2026, semester: 1 }],
    ['28 Feb 2026', on(2026, 2, 28), null,                       { year: 2026, semester: 1 }],
    ['2 Mar 2026',  on(2026, 3, 2),  { year: 2026, semester: 1 }, { year: 2026, semester: 2 }],
    ['30 Jun 2026', on(2026, 6, 30), { year: 2026, semester: 1 }, { year: 2026, semester: 2 }],
    ['20 Jul 2026', on(2026, 7, 20), null,                       { year: 2026, semester: 2 }],
    ['28 Aug 2026', on(2026, 8, 28), null,                       { year: 2026, semester: 2 }],
    ['1 Sep 2026',  on(2026, 9, 1),  { year: 2026, semester: 2 }, { year: 2027, semester: 1 }],
    ['26 Sep 2026', on(2026, 9, 26), { year: 2026, semester: 2 }, { year: 2027, semester: 1 }],
    ['30 Nov 2026', on(2026, 11, 30), { year: 2026, semester: 2 }, { year: 2027, semester: 1 }],
    ['20 Dec 2026', on(2026, 12, 20), null,                      { year: 2027, semester: 1 }],
  ])('%s', (_label, now, current, next) => {
    const result = describeAcademicNow(now);
    expect(result.current).toEqual(current);
    expect(result.next).toEqual(next);
  });

  // The year has to roll over, not stay put. This is the whole reason the derivation is not just a month test.
  test('during semester 2 the next semester belongs to the following year', () => {
    const result = describeAcademicNow(on(2026, 9, 26));

    expect(result.next).toEqual({ year: 2027, semester: 1 });
    expect(result.label).toBe('Semester 1, 2027');
    expect(result.reason).toMatch(/semester 1 of next year/i);
  });

  test('every date yields a next semester and a reason for it', () => {
    for (let month = 1; month <= 12; month++) {
      const result = describeAcademicNow(on(2026, month, 15));

      expect([1, 2]).toContain(result.next.semester);
      expect(result.next.year).toBeGreaterThanOrEqual(2026);
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.label).toBe(formatTerm(result.next));
    }
  });

  // Semester 3 (summer) and 4 (winter) carry catch-up units, never a cohort's normal load, so they can never
  // be a target. A student who took a unit in one of those terms is handled by the transcript, not here.
  test('a short term is never the target', () => {
    for (let month = 1; month <= 12; month++) {
      expect(nextTargetTerm(on(2026, month, 15))).toBeLessThanOrEqual(2);
    }
  });

  test('nextTargetTerm agrees with describeAcademicNow', () => {
    for (let month = 1; month <= 12; month++) {
      const now = on(2026, month, 15);
      expect(nextTargetTerm(now)).toBe(describeAcademicNow(now).next.semester);
    }
  });
});
