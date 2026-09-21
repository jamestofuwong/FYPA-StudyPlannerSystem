import {
  addSemester,
  addUnit,
  moveUnit,
  removeUnit,
} from '@core/shared/scheduling/planEdits';
import { validatePlan } from '@core/shared/scheduling/planValidator';
import {
  buildCustomPlan,
  type CustomSemesterBucket,
  type SchedulableUnit,
} from '@core/services/scheduling/customPlannerScheduler';

function unit(code: string, overrides: Partial<SchedulableUnit> = {}): SchedulableUnit {
  return {
    code,
    name: `Unit ${code}`,
    category: 'core',
    offeringSemesters: [1, 2],
    allOfferingTerms: [1, 2],
    requisiteGroups: [],
    ...overrides,
  };
}

const bucket = (year: number, semester: 1 | 2, ...codes: string[]): CustomSemesterBucket => ({
  year,
  semester,
  units: codes.map((code) => ({ code, name: `Unit ${code}`, category: 'core' })),
});

const shape = (semesters: CustomSemesterBucket[]) =>
  semesters.map((s) => [`${s.year}-${s.semester}`, s.units.map((u) => u.code)] as const);

/** A deep copy, to prove an operation left the caller's array untouched. */
const snapshot = (semesters: CustomSemesterBucket[]) => JSON.parse(JSON.stringify(semesters));

describe('plan edits', () => {
  const plan = () => [bucket(2024, 1, 'A', 'B'), bucket(2024, 2, 'C')];

  describe('removeUnit', () => {
    test('drops the unit and returns a new array without mutating the input', () => {
      const input = plan();
      const before = snapshot(input);
      const result = removeUnit(input, 'A');

      expect(shape(result)).toEqual([['2024-1', ['B']], ['2024-2', ['C']]]);
      expect(result).not.toBe(input);
      expect(input).toEqual(before);
    });

    test('a code that is not in the plan is a no-op', () => {
      const input = plan();
      const result = removeUnit(input, 'NOPE');

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    test('is case and whitespace insensitive', () => {
      expect(shape(removeUnit(plan(), '  a '))).toEqual([['2024-1', ['B']], ['2024-2', ['C']]]);
    });

    test('removing the last unit leaves the semester in place, empty', () => {
      const result = removeUnit(plan(), 'C');
      expect(shape(result)).toEqual([['2024-1', ['A', 'B']], ['2024-2', []]]);
    });
  });

  describe('addUnit', () => {
    test('appends to the named slot without mutating the input', () => {
      const input = plan();
      const before = snapshot(input);
      const result = addUnit(input, unit('NEW'), 2024, 2);

      expect(shape(result)).toEqual([['2024-1', ['A', 'B']], ['2024-2', ['C', 'NEW']]]);
      expect(result).not.toBe(input);
      expect(input).toEqual(before);
    });

    test('a unit already placed elsewhere is moved, never duplicated', () => {
      const result = addUnit(plan(), unit('A'), 2024, 2);

      expect(shape(result)).toEqual([['2024-1', ['B']], ['2024-2', ['C', 'A']]]);
      const placements = result.flatMap((s) => s.units.map((u) => u.code)).filter((c) => c === 'A');
      expect(placements).toHaveLength(1);
    });

    test('an unknown slot is a no-op', () => {
      const input = plan();
      const result = addUnit(input, unit('NEW'), 2030, 1);

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    test('carries the name and category onto the placed unit', () => {
      const result = addUnit(plan(), unit('MPU1', { category: 'mpu', name: 'Bahasa' }), 2024, 1);
      expect(result[0].units.at(-1)).toEqual({ code: 'MPU1', name: 'Bahasa', category: 'mpu' });
    });
  });

  describe('moveUnit', () => {
    test('moves between semesters without mutating the input', () => {
      const input = plan();
      const before = snapshot(input);
      const result = moveUnit(input, 'A', 2024, 2);

      expect(shape(result)).toEqual([['2024-1', ['B']], ['2024-2', ['C', 'A']]]);
      expect(result).not.toBe(input);
      expect(input).toEqual(before);
    });

    test('moving to the semester it is already in is a no-op', () => {
      const input = plan();
      const result = moveUnit(input, 'A', 2024, 1);

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    test('a unit that is not placed is a no-op', () => {
      const input = plan();
      expect(moveUnit(input, 'NOPE', 2024, 2)).toEqual(input);
    });

    test('an unknown target slot is a no-op', () => {
      const input = plan();
      expect(moveUnit(input, 'A', 2030, 1)).toEqual(input);
    });

    test('keeps the name and category of the moved unit', () => {
      const withMpu = [bucket(2024, 1), bucket(2024, 2)];
      const added = addUnit(withMpu, unit('MPU1', { category: 'mpu', name: 'Bahasa' }), 2024, 1);
      const moved = moveUnit(added, 'MPU1', 2024, 2);

      expect(moved[1].units).toEqual([{ code: 'MPU1', name: 'Bahasa', category: 'mpu' }]);
    });
  });

  describe('addSemester', () => {
    test('after semester 1 comes semester 2 of the same year', () => {
      const result = addSemester([bucket(2024, 1, 'A')]);
      expect(shape(result)).toEqual([['2024-1', ['A']], ['2024-2', []]]);
    });

    test('after semester 2 comes semester 1 of the next year', () => {
      const result = addSemester([bucket(2024, 1, 'A'), bucket(2024, 2, 'B')]);
      expect(shape(result)).toEqual([['2024-1', ['A']], ['2024-2', ['B']], ['2025-1', []]]);
    });

    test('does not mutate the input', () => {
      const input = plan();
      const before = snapshot(input);
      const result = addSemester(input);

      expect(result).toHaveLength(input.length + 1);
      expect(input).toEqual(before);
    });

    test('an empty plan starts at year 1 semester 1', () => {
      expect(shape(addSemester([]))).toEqual([['1-1', []]]);
    });
  });

  // The three pieces together: generate, edit, then validate the edit.
  test('moving a unit before its prerequisite is reported by validatePlan', () => {
    const units = [
      unit('INTRO'),
      unit('ADV', { requisiteGroups: [[{ type: 'unit', unitCode: 'INTRO', requisiteType: 'prerequisite' }]] }),
    ];
    const unitData = new Map(units.map((u) => [u.code, u]));

    const generated = buildCustomPlan(units, [], 2024, 1);
    expect(validatePlan({ semesters: generated.semesters, completedUnitCodes: [], unitData })).toEqual([]);

    // ADV was scheduled after INTRO; drag it back into the first semester
    const edited = moveUnit(generated.semesters, 'ADV', generated.semesters[0].year, generated.semesters[0].semester);

    expect(validatePlan({ semesters: edited, completedUnitCodes: [], unitData })).toEqual([
      { kind: 'requisite_violation', unitCode: 'ADV', missing: ['INTRO'] },
    ]);
  });
});
