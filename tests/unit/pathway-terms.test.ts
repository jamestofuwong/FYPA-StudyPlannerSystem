import { monthsOf, offeringHint } from '@/app/(pages)/pathway/terms';

describe('monthsOf', () => {
  test('names each calendar term by its months', () => {
    expect([1, 2, 3, 4].map(monthsOf)).toEqual(['Feb/Mar', 'Aug/Sep', 'summer', 'winter']);
  });

  test('an unknown term is still readable', () => {
    expect(monthsOf(9)).toBe('term 9');
  });
});

describe('offeringHint', () => {
  test('a unit that runs in the term needs no hint', () => {
    expect(offeringHint({ offeringSemesters: [1, 2], allOfferingTerms: [1, 2] }, 2)).toBe('');
  });

  test('a unit that runs only in the other semester says it is not offered this term', () => {
    expect(offeringHint({ offeringSemesters: [1], allOfferingTerms: [1] }, 2)).toBe('not offered this term');
  });

  test('a unit with no offering rows at all is unknown', () => {
    expect(offeringHint({ offeringSemesters: [], allOfferingTerms: [] }, 1)).toBe('offering unknown');
    // A caller that predates allOfferingTerms is the same case
    expect(offeringHint({ offeringSemesters: [] }, 1)).toBe('offering unknown');
  });

  test('a winter-only unit says where it does run, not "offering unknown"', () => {
    expect(offeringHint({ offeringSemesters: [], allOfferingTerms: [4] }, 1)).toBe('only runs in winter');
  });

  test('a summer-only unit says summer', () => {
    expect(offeringHint({ offeringSemesters: [], allOfferingTerms: [3] }, 2)).toBe('only runs in summer');
  });

  test('a unit that runs in both break terms names both', () => {
    expect(offeringHint({ offeringSemesters: [], allOfferingTerms: [3, 4] }, 1)).toBe('only runs in summer and winter');
  });

  test('a unit with a semester and a break term is judged on its semester', () => {
    expect(offeringHint({ offeringSemesters: [2], allOfferingTerms: [2, 4] }, 2)).toBe('');
    expect(offeringHint({ offeringSemesters: [2], allOfferingTerms: [2, 4] }, 1)).toBe('not offered this term');
  });
});
