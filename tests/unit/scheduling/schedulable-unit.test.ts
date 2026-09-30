import {
  splitOfferingTerms,
  toRequisiteGroups,
  toSchedulableUnit,
} from '@core/shared/scheduling/schedulableUnit';

describe('splitOfferingTerms', () => {
  test('keeps semesters 1 and 2 as placeable', () => {
    expect(splitOfferingTerms([1, 2])).toEqual({ allOfferingTerms: [1, 2], offeringSemesters: [1, 2] });
  });

  test('a summer or winter only unit keeps its terms but is not placeable', () => {
    expect(splitOfferingTerms([3, 4])).toEqual({ allOfferingTerms: [3, 4], offeringSemesters: [] });
    expect(splitOfferingTerms([4])).toEqual({ allOfferingTerms: [4], offeringSemesters: [] });
  });

  test('a mixed unit stays placeable in its semester', () => {
    expect(splitOfferingTerms([2, 3, 4])).toEqual({ allOfferingTerms: [2, 3, 4], offeringSemesters: [2] });
  });

  test('no offering data stays empty, which the scheduler reads as unrestricted', () => {
    expect(splitOfferingTerms([])).toEqual({ allOfferingTerms: [], offeringSemesters: [] });
    expect(splitOfferingTerms(null)).toEqual({ allOfferingTerms: [], offeringSemesters: [] });
    expect(splitOfferingTerms(undefined)).toEqual({ allOfferingTerms: [], offeringSemesters: [] });
  });

  test('duplicates are removed and terms sorted', () => {
    expect(splitOfferingTerms([2, 1, 2]).allOfferingTerms).toEqual([1, 2]);
  });
});

describe('toRequisiteGroups', () => {
  test('uppercases unit codes and defaults the requisite type', () => {
    expect(toRequisiteGroups([[{ type: 'unit', unitCode: 'cos10009' }]])).toEqual([
      [{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'COS10009' }],
    ]);
  });

  test('keeps corequisites and antirequisites as given', () => {
    expect(toRequisiteGroups([[
      { type: 'unit', unitCode: 'A', requisiteType: 'corequisite' },
      { type: 'unit', unitCode: 'B', requisiteType: 'antirequisite' },
    ]])).toEqual([[
      { type: 'unit', requisiteType: 'corequisite', unitCode: 'A' },
      { type: 'unit', requisiteType: 'antirequisite', unitCode: 'B' },
    ]]);
  });

  test('converts credit points to a number', () => {
    expect(toRequisiteGroups([[{ type: 'credit_points', creditPoints: '100' }]])).toEqual([
      [{ type: 'credit_points', creditPoints: 100 }],
    ]);
  });

  test('drops unit conditions with no code, and groups left empty', () => {
    expect(toRequisiteGroups([
      [{ type: 'unit', unitCode: null }],
      [{ type: 'unit', unitCode: 'A' }, { type: 'unit', unitCode: undefined }],
      [],
    ])).toEqual([[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'A' }]]);
  });

  test('a nullish argument is safe', () => {
    expect(toRequisiteGroups(null)).toEqual([]);
    expect(toRequisiteGroups(undefined)).toEqual([]);
  });
});

describe('toSchedulableUnit', () => {
  test('maps a unit both apps could supply', () => {
    expect(toSchedulableUnit({
      code: 'COS30049',
      name: 'Computing Technology Innovation Project',
      category: 'major_core',
      offeringTerms: [1, 3],
      requisiteGroups: [[{ type: 'unit', unitCode: 'cos20007' }]],
    })).toEqual({
      code: 'COS30049',
      name: 'Computing Technology Innovation Project',
      category: 'major_core',
      offeringSemesters: [1],
      allOfferingTerms: [1, 3],
      requisiteGroups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'COS20007' }]],
    });
  });

  test('a unit with no offerings or requisites is unrestricted', () => {
    expect(toSchedulableUnit({ code: 'A', name: 'Unit A', category: 'core' })).toEqual({
      code: 'A',
      name: 'Unit A',
      category: 'core',
      offeringSemesters: [],
      allOfferingTerms: [],
      requisiteGroups: [],
    });
  });
});
