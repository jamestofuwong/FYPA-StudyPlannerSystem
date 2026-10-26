import { toRequisiteGroups, requisiteUnitCodes, requisiteCreditPoints } from '@/lib/requisites';
import { termLabel } from '@/lib/term-labels';

const cond = (over: Record<string, unknown>) => ({ type: 'unit', requisite_type: 'prerequisite', credit_points: null, external_requisite: null, unit: null, ...over });

describe('requisites', () => {
  const groups = toRequisiteGroups([
    { conditions: [cond({ unit: { unit_code: 'COS10009' } }), cond({ unit: { unit_code: 'COS10004' }, requisite_type: 'corequisite' })] },
    { conditions: [cond({ type: 'credit_points', credit_points: '50.0', requisite_type: null })] },
    { conditions: [cond({ external_requisite: 'Instructor consent' })] },
  ]);

  test('database rows become groups of conditions (a group is AND, the list of groups is OR)', () => {
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual([
      { type: 'unit', requisiteType: 'prerequisite', unitCode: 'COS10009' },
      { type: 'unit', requisiteType: 'corequisite', unitCode: 'COS10004' },
    ]);
    expect(groups[2][0]).toMatchObject({ externalRequisite: 'Instructor consent' });
  });

  test('credit points arrive as text from the database and are returned as numbers', () => {
    expect(groups[1][0].creditPoints).toBe(50);
  });

  test('unit codes are listed by requisite type', () => {
    expect(requisiteUnitCodes(groups, 'prerequisite')).toEqual(['COS10009']);
    expect(requisiteUnitCodes(groups, 'corequisite')).toEqual(['COS10004']);
    expect(requisiteUnitCodes(groups, 'antirequisite')).toEqual([]);
  });

  test('a condition with no type counts as a prerequisite (credit points are such a condition)', () => {
    expect(requisiteCreditPoints(groups, 'prerequisite')).toEqual([50]);
  });

  test('zero, negative and missing credit points are ignored', () => {
    const g = toRequisiteGroups([{ conditions: [cond({ type: 'credit_points', credit_points: 0 }), cond({ type: 'credit_points', credit_points: '-5' }), cond({ type: 'credit_points', credit_points: null })] }]);
    expect(requisiteCreditPoints(g, 'prerequisite')).toEqual([]);
  });

  test('no groups gives empty lists, not an error', () => {
    expect(requisiteUnitCodes(undefined, 'prerequisite')).toEqual([]);
    expect(requisiteCreditPoints(undefined, 'prerequisite')).toEqual([]);
  });
});

describe('term labels', () => {
  test.each([[1, 'Semester 1'], [2, 'Semester 2'], [3, 'Summer Term'], [4, 'Winter Term'], [7, 'Term 7']])('term %i is "%s"', (term, label) => {
    expect(termLabel(term)).toBe(label);
  });
});
