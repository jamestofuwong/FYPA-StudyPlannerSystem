// ============================================================
// Tests for core/services/classEstimation/newIntakeSetting.ts: the stored new first-year students figure.
//
// It is one number. The course is not part of it: it is detected from the students loaded. A version of the
// page briefly stored a figure per course as JSON, and that is still read, as the sum of its figures.
// ============================================================

import { parseNewIntakeTotal } from '@core/services/classEstimation/newIntakeSetting';

describe('parseNewIntakeTotal', () => {
  test('reads a whole number', () => {
    expect(parseNewIntakeTotal('60')).toBe(60);
    expect(parseNewIntakeTotal(' 0 ')).toBe(0);
  });

  // An unset key comes back as null, and Number(null) is 0, the trap the retention rate once fell into.
  test.each([[null], [undefined], [''], ['   ']])('%p is nothing set, not zero', (value) => {
    expect(parseNewIntakeTotal(value)).toBeNull();
  });

  test.each([['not json'], ['[60]'], ['-5'], ['12.5'], ['{}']])('%p is unusable', (value) => {
    expect(parseNewIntakeTotal(value)).toBeNull();
  });

  test('the per-course format briefly saved is read as its total', () => {
    expect(parseNewIntakeTotal(JSON.stringify({ 'Bachelor of Computer Science': 60 }))).toBe(60);
    expect(parseNewIntakeTotal(JSON.stringify({ A: 60, B: 40, C: -1 }))).toBe(100);
  });
});
