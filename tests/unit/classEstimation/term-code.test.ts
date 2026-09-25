// ============================================================
// Tests for core/services/classEstimation/termCode.ts.
// The Term column is the most reliable thing a transcript says about when a unit was taken, so intake is
// derived from it rather than from the ambiguous DD/MM/YYYY enrollmentDate. Codes below are the real ones
// from a DPA export: 2024_FEB_S1, 2025_MAR_S1, 2026_SEP_S2, 2026_JUN_WT.
// ============================================================

import {
  parseTermCode,
  compareTerms,
  earliestTerm,
  earliestSemesterTerm,
} from '@core/services/classEstimation/termCode';

describe('parseTermCode', () => {
  // Term numbers match the unit_offerings convention: 1 = Sem 1, 2 = Sem 2, 3 = Summer, 4 = Winter.
  test.each([
    ['2024_FEB_S1', 2024, 2, 1, 'semester'],
    ['2024_SEP_S2', 2024, 9, 2, 'semester'],
    ['2025_MAR_S1', 2025, 3, 1, 'semester'],
    ['2026_JUN_WT', 2026, 6, 4, 'winter'],
    ['2025_DEC_ST', 2025, 12, 3, 'summer'],
  ])('%s reads as year %i, month %i, term %i, kind %s', (raw, year, month, term, kind) => {
    expect(parseTermCode(raw)).toEqual({ year, month, term, kind, raw });
  });

  test('is case and separator insensitive', () => {
    expect(parseTermCode('2024_feb_s1')?.term).toBe(1);
    expect(parseTermCode('2024-FEB-S1')?.term).toBe(1);
    expect(parseTermCode('  2024_FEB_S1  ')?.year).toBe(2024);
  });

  // Returning null rather than guessing matters: a wrong guess puts a real student in the wrong intake,
  // and the caller can warn instead.
  test.each([
    ['', 'empty'],
    ['20241', 'no separators'],
    ['2024_FEB', 'no teaching period'],
    ['2024_XXX_S1', 'unknown month'],
    ['2024_FEB_S9', 'unknown period'],
    ['not-a-term', 'not a term at all'],
  ])('%s is rejected (%s)', (raw) => {
    expect(parseTermCode(raw)).toBeNull();
  });

  test('null and undefined are rejected without throwing', () => {
    expect(parseTermCode(null)).toBeNull();
    expect(parseTermCode(undefined)).toBeNull();
  });
});

describe('compareTerms', () => {
  test('orders by year, then by the month the period starts in', () => {
    const codes = ['2026_SEP_S2', '2024_FEB_S1', '2025_MAR_S1', '2026_JUN_WT'];
    const sorted = codes
      .map((c) => parseTermCode(c)!)
      .sort(compareTerms)
      .map((t) => t.raw);

    expect(sorted).toEqual(['2024_FEB_S1', '2025_MAR_S1', '2026_JUN_WT', '2026_SEP_S2']);
  });
});

describe('earliestTerm', () => {
  // The real sequence from a DPA export, deliberately out of order.
  test('finds the earliest term across a transcript', () => {
    const terms = ['2025_MAR_S1', '2024_FEB_S1', '2026_SEP_S2', '2024_SEP_S2'];
    expect(earliestTerm(terms)?.raw).toBe('2024_FEB_S1');
  });

  test('skips unparseable codes instead of failing', () => {
    expect(earliestTerm(['', 'rubbish', '2025_MAR_S1'])?.raw).toBe('2025_MAR_S1');
  });

  test('returns null when nothing can be read', () => {
    expect(earliestTerm(['', 'rubbish', null, undefined])).toBeNull();
  });
});

describe('earliestSemesterTerm', () => {
  // An intake starts in a teaching semester, never in a short term. A student who took a winter unit
  // before their first semester would otherwise be read as having a winter intake, which no planner has.
  test('ignores an earlier short term in favour of the first real semester', () => {
    const terms = ['2024_JAN_ST', '2024_FEB_S1', '2024_SEP_S2'];

    expect(earliestTerm(terms)?.raw).toBe('2024_JAN_ST');
    expect(earliestSemesterTerm(terms)?.raw).toBe('2024_FEB_S1');
  });

  test('falls back to any term when the transcript has no semester term at all', () => {
    expect(earliestSemesterTerm(['2026_JUN_WT'])?.raw).toBe('2026_JUN_WT');
  });

  test('returns null when nothing can be read', () => {
    expect(earliestSemesterTerm(['rubbish'])).toBeNull();
  });
});
