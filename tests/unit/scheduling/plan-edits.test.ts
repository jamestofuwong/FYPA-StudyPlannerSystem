import {
  addSemester,
  addUnit,
  moveUnit,
  removeUnit,
  replaceUnit,
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

  describe('replaceUnit', () => {
    const incoming = { code: 'NEW', name: 'Unit NEW', category: 'elective' };

    test('the new unit takes the semester and position of the old one', () => {
      const input = [bucket(2024, 1, 'A', 'B', 'C'), bucket(2024, 2, 'D')];
      const result = replaceUnit(input, 'B', incoming);

      // B was in the middle of semester one, so NEW is too
      expect(shape(result)).toEqual([['2024-1', ['A', 'NEW', 'C']], ['2024-2', ['D']]]);
    });

    test('carries the category of the new unit, not the old one', () => {
      const result = replaceUnit(plan(), 'A', incoming);
      expect(result[0].units[0]).toEqual({ code: 'NEW', name: 'Unit NEW', category: 'elective' });
    });

    test('returns a new array and never mutates the input', () => {
      const input = plan();
      const before = snapshot(input);
      const result = replaceUnit(input, 'A', incoming);

      expect(result).not.toBe(input);
      expect(result[0]).not.toBe(input[0]);
      expect(input).toEqual(before);
    });

    test('a code that is not in the plan leaves it as it was', () => {
      const input = plan();
      const result = replaceUnit(input, 'NOPE', incoming);

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });

    test('a unit already placed anywhere is never duplicated', () => {
      const input = plan();

      // Placed in another semester, and placed in the same one
      expect(replaceUnit(input, 'A', { ...incoming, code: 'C' })).toEqual(input);
      expect(replaceUnit(input, 'A', { ...incoming, code: 'B' })).toEqual(input);
      // Replacing a unit with itself is the same case
      expect(replaceUnit(input, 'A', { ...incoming, code: 'A' })).toEqual(input);
    });

    test('matches codes ignoring case and whitespace', () => {
      expect(shape(replaceUnit(plan(), ' a ', { ...incoming, code: ' new ' }))).toEqual([
        ['2024-1', [' new ', 'B']],
        ['2024-2', ['C']],
      ]);
      expect(replaceUnit(plan(), 'A', { ...incoming, code: ' c ' })).toEqual(plan());
    });

    test('keeps the recommended and outsidePlanner flags only when they are set', () => {
      const chosen = replaceUnit(plan(), 'A', { ...incoming, recommended: false, outsidePlanner: true });
      expect(chosen[0].units[0]).toEqual({ ...incoming, outsidePlanner: true });
      expect('recommended' in chosen[0].units[0]).toBe(false);
    });

    // The backfill can leave several placeholders that all share one code
    describe('placeholders that share a code', () => {
      const withPlaceholders = () => [
        { year: 2024, semester: 1 as const, units: [
          { code: 'A', name: 'Unit A', category: 'core' },
          { code: 'ELECTIVE', name: 'Elective Slot', category: 'elective' },
        ] },
        { year: 2024, semester: 2 as const, units: [
          { code: 'ELECTIVE', name: 'Elective Slot', category: 'elective' },
          { code: 'B', name: 'Unit B', category: 'core' },
          { code: 'ELECTIVE', name: 'Elective Slot', category: 'elective' },
        ] },
      ];

      test('without a location, the first in plan order is replaced', () => {
        expect(shape(replaceUnit(withPlaceholders(), 'ELECTIVE', incoming))).toEqual([
          ['2024-1', ['A', 'NEW']],
          ['2024-2', ['ELECTIVE', 'B', 'ELECTIVE']],
        ]);
      });

      test('with a location, the placeholder in that semester is the one replaced', () => {
        const result = replaceUnit(withPlaceholders(), 'ELECTIVE', incoming, { year: 2024, semester: 2 });

        // The first placeholder of semester two, at its own position; semester one is untouched
        expect(shape(result)).toEqual([
          ['2024-1', ['A', 'ELECTIVE']],
          ['2024-2', ['NEW', 'B', 'ELECTIVE']],
        ]);
      });

      test('a location that holds no such unit leaves the plan as it was', () => {
        const input = withPlaceholders();
        expect(replaceUnit(input, 'A', incoming, { year: 2024, semester: 2 })).toEqual(input);
      });
    });

    test('after a replacement the plan validates like any other edit', () => {
      const units = [unit('INTRO'), unit('ELEC1', { category: 'elective' })];
      const plan1 = buildCustomPlan(units, [], 2024, 1);
      const replaced = replaceUnit(plan1.semesters, 'ELEC1', { code: 'SWAP', name: 'Unit SWAP', category: 'elective' });
      const data = new Map<string, SchedulableUnit>([
        ['INTRO', units[0]],
        ['SWAP', unit('SWAP', { category: 'elective', requisiteGroups: [[{ type: 'unit', unitCode: 'INTRO', requisiteType: 'prerequisite' }]] })],
      ]);

      // SWAP needs INTRO, which sits in the same semester, so the swap is judged like any other placement
      const kinds = validatePlan({ semesters: replaced, completedUnitCodes: [], unitData: data }).map((w) => w.kind);
      expect(kinds).toEqual(['requisite_violation']);
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
