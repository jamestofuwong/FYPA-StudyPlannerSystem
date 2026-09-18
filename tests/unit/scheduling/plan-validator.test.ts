import { validatePlan } from '@core/shared/scheduling/planValidator';
import {
  buildCustomPlan,
  type CustomSemesterBucket,
  type PlanWarning,
  type SchedulableUnit,
} from '@core/services/scheduling/customPlannerScheduler';

// Offerings default to both semesters so a fixture only opts in to a restriction
function unit(
  code: string,
  overrides: Partial<SchedulableUnit> = {},
): SchedulableUnit {
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

const unitData = (units: SchedulableUnit[]) =>
  new Map(units.map((u) => [u.code.toUpperCase(), u]));

const prereq = (code: string) => ({ type: 'unit' as const, unitCode: code, requisiteType: 'prerequisite' as const });
const coreq = (code: string) => ({ type: 'unit' as const, unitCode: code, requisiteType: 'corequisite' as const });
const antireq = (code: string) => ({ type: 'unit' as const, unitCode: code, requisiteType: 'antirequisite' as const });

const bucket = (year: number, semester: 1 | 2, ...units: SchedulableUnit[]): CustomSemesterBucket => ({
  year,
  semester,
  units: units.map((u) => ({ code: u.code, name: u.name, category: u.category })),
});

const kinds = (warnings: PlanWarning[]) => warnings.map((w) => w.kind);

describe('validatePlan', () => {
  describe('agreement with buildCustomPlan', () => {
    // The failure mode this guards: the generator places a unit the validator
    // then calls illegal.
    const units = [
      unit('INTRO'),
      unit('SEM2-ONLY', { offeringSemesters: [2], allOfferingTerms: [2] }),
      unit('ADV', { requisiteGroups: [[prereq('INTRO')]] }),
      unit('PAIR-A'),
      unit('PAIR-B', { requisiteGroups: [[coreq('PAIR-A')]] }),
      unit('ELECTIVE', { category: 'prescribed_elective' }),
      unit('MPU1', { category: 'mpu' }),
      unit('CAPSTONE', { requisiteGroups: [[{ type: 'credit_points', creditPoints: 25 }]] }),
    ];

    test('a generated plan validates with no warnings', () => {
      const plan = buildCustomPlan(units, ['PRIOR'], 2024, 1);

      expect(plan.semesters.length).toBeGreaterThan(1);
      expect(plan.unschedulableUnits).toEqual([]);
      expect(validatePlan({
        semesters: plan.semesters,
        completedUnitCodes: ['PRIOR'],
        unitData: unitData(units),
      })).toEqual([]);
    });

    test('a generated September intake plan validates with no warnings', () => {
      const plan = buildCustomPlan(units, ['PRIOR'], 2024, 1, 2);

      expect(validatePlan({
        semesters: plan.semesters,
        completedUnitCodes: ['PRIOR'],
        intakeSemester: 2,
        unitData: unitData(units),
      })).toEqual([]);
    });
  });

  describe('requisites', () => {
    test('a unit moved before its prerequisite names the prerequisite', () => {
      const units = [unit('INTRO'), unit('ADV', { requisiteGroups: [[prereq('INTRO')]] })];
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, units[1]), bucket(2024, 2, units[0])],
        completedUnitCodes: [],
        unitData: unitData(units),
      });

      expect(warnings).toEqual([
        { kind: 'requisite_violation', unitCode: 'ADV', missing: ['INTRO'] },
      ]);
    });

    test('a prerequisite in an earlier semester is satisfied', () => {
      const units = [unit('INTRO'), unit('ADV', { requisiteGroups: [[prereq('INTRO')]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0]), bucket(2024, 2, units[1])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([]);
    });

    test('a prerequisite in the SAME semester is not enough', () => {
      const units = [unit('INTRO'), unit('ADV', { requisiteGroups: [[prereq('INTRO')]] })];
      expect(kinds(validatePlan({
        semesters: [bucket(2024, 1, units[0], units[1])],
        completedUnitCodes: [],
        unitData: unitData(units),
      }))).toEqual(['requisite_violation']);
    });

    test('a corequisite pair in the same semester is valid', () => {
      const units = [unit('PAIR-A'), unit('PAIR-B', { requisiteGroups: [[coreq('PAIR-A')]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0], units[1])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([]);
    });

    test('a corequisite split across semesters is valid forwards, invalid backwards', () => {
      const units = [unit('PAIR-A'), unit('PAIR-B', { requisiteGroups: [[coreq('PAIR-A')]] })];

      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0]), bucket(2024, 2, units[1])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([]);

      expect(validatePlan({
        semesters: [bucket(2024, 1, units[1]), bucket(2024, 2, units[0])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'requisite_violation', unitCode: 'PAIR-B', missing: ['PAIR-A'] },
      ]);
    });

    test('an antirequisite already completed is a conflict', () => {
      const units = [unit('ADV', { requisiteGroups: [[antireq('OLD')]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: ['OLD'],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'requisite_violation', unitCode: 'ADV', missing: [], conflictsWith: ['OLD'] },
      ]);
    });

    test('one satisfied alternative group is enough', () => {
      const units = [unit('ELECTIVE', {
        requisiteGroups: [[prereq('MISSING')], [prereq('DONE')]],
      })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: ['DONE'],
        unitData: unitData(units),
      })).toEqual([]);
    });

    test('credit points not yet earned are reported', () => {
      const units = [unit('CAPSTONE', { requisiteGroups: [[{ type: 'credit_points', creditPoints: 100 }]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: ['A', 'B'],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'requisite_violation', unitCode: 'CAPSTONE', missing: [], creditPointsNeeded: 100 },
      ]);
    });
  });

  describe('Conceded Pass', () => {
    test('does not satisfy a prerequisite', () => {
      const units = [unit('ADV', { requisiteGroups: [[prereq('BASE')]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: ['BASE'],
        concededPassUnitCodes: ['BASE'],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'requisite_violation', unitCode: 'ADV', missing: ['BASE'], concededPass: ['BASE'] },
      ]);
    });

    test('does not satisfy a corequisite', () => {
      const units = [unit('ADV', { requisiteGroups: [[coreq('BASE')]] })];
      expect(kinds(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: ['BASE'],
        concededPassUnitCodes: ['BASE'],
        unitData: unitData(units),
      }))).toEqual(['requisite_violation']);
    });

    test('still counts as taken for an antirequisite', () => {
      const units = [unit('ADV', { requisiteGroups: [[antireq('BASE')]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: [],
        concededPassUnitCodes: ['BASE'],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'requisite_violation', unitCode: 'ADV', missing: [], conflictsWith: ['BASE'] },
      ]);
    });

    test('counts toward credit points', () => {
      const units = [unit('CAPSTONE', { requisiteGroups: [[{ type: 'credit_points', creditPoints: 25 }]] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: ['DONE'],
        concededPassUnitCodes: ['CP-UNIT'],
        unitData: unitData(units),
      })).toEqual([]);
    });
  });

  describe('offerings', () => {
    test('a unit placed in a semester it is not offered in', () => {
      const units = [unit('SEM2-ONLY', { offeringSemesters: [2], allOfferingTerms: [2] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'not_offered', unitCode: 'SEM2-ONLY', offeringTerms: [2] },
      ]);
    });

    test('a summer or winter only unit does not belong in an ordinary semester', () => {
      const units = [unit('MPU3212', { category: 'mpu', offeringSemesters: [], allOfferingTerms: [3, 4] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'short_term_only', unitCode: 'MPU3212', offeringTerms: [3, 4] },
      ]);
    });

    test('a unit with no offering data is flagged as unverified', () => {
      const units = [unit('NODATA', { offeringSemesters: [], allOfferingTerms: [] })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([
        { kind: 'no_offering_data', unitCode: 'NODATA' },
      ]);
    });

    test('a unit absent from unitData is flagged rather than assumed legal', () => {
      expect(validatePlan({
        semesters: [bucket(2024, 1, unit('UNKNOWN'))],
        completedUnitCodes: [],
        unitData: new Map(),
      })).toEqual([
        { kind: 'no_offering_data', unitCode: 'UNKNOWN' },
      ]);
    });

    test('September intake: a Semester 2 unit belongs in slot 1, not slot 2', () => {
      const units = [unit('SEM2-ONLY', { offeringSemesters: [2], allOfferingTerms: [2] })];

      expect(validatePlan({
        semesters: [bucket(2024, 1, units[0])],
        completedUnitCodes: [],
        intakeSemester: 2,
        unitData: unitData(units),
      })).toEqual([]);

      expect(validatePlan({
        semesters: [bucket(2024, 2, units[0])],
        completedUnitCodes: [],
        intakeSemester: 2,
        unitData: unitData(units),
      })).toEqual([
        { kind: 'not_offered', unitCode: 'SEM2-ONLY', offeringTerms: [2] },
      ]);
    });
  });

  describe('capacity', () => {
    const five = ['C1', 'C2', 'C3', 'C4', 'C5'].map((c) => unit(c));

    test('five standard units in a semester is over the normal load', () => {
      expect(validatePlan({
        semesters: [bucket(2024, 1, ...five)],
        completedUnitCodes: [],
        unitData: unitData(five),
      })).toEqual([
        { kind: 'over_capacity', year: 2024, semester: 1, count: 5, limit: 4 },
      ]);
    });

    test('a per-semester override does not lower the threshold, matching buildCustomPlan', () => {
      const generated = buildCustomPlan(five, [], 2024, 1, 1, [], { perSemesterOverrides: { '2024-1': 5 } });
      const validated = validatePlan({
        semesters: [bucket(2024, 1, ...five)],
        completedUnitCodes: [],
        unitData: unitData(five),
        config: { perSemesterOverrides: { '2024-1': 5 } },
      });

      expect(generated.warnings).toContainEqual(
        { kind: 'over_capacity', year: 2024, semester: 1, count: 5, limit: 4 },
      );
      expect(validated).toEqual(generated.warnings.filter((w) => w.kind === 'over_capacity'));
    });

    test('MPU units do not count toward the standard load', () => {
      const units = [...['C1', 'C2', 'C3', 'C4'].map((c) => unit(c)), unit('MPU1', { category: 'mpu' })];
      expect(validatePlan({
        semesters: [bucket(2024, 1, ...units)],
        completedUnitCodes: [],
        unitData: unitData(units),
      })).toEqual([]);
    });
  });

  describe('compulsory units', () => {
    const required = [unit('REQ1'), unit('REQ2')];

    test('a required unit in neither the plan nor the completed list is named', () => {
      expect(validatePlan({
        semesters: [bucket(2024, 1, required[0])],
        completedUnitCodes: [],
        requiredUnits: required,
        unitData: unitData(required),
      })).toEqual([
        { kind: 'compulsory_missing', unitCodes: ['REQ2'] },
      ]);
    });

    test('a required unit already completed is not reported', () => {
      expect(validatePlan({
        semesters: [bucket(2024, 1, required[0])],
        completedUnitCodes: ['req2'],
        requiredUnits: required,
        unitData: unitData(required),
      })).toEqual([]);
    });

    test('omitting requiredUnits skips the check', () => {
      expect(validatePlan({
        semesters: [bucket(2024, 1, required[0])],
        completedUnitCodes: [],
        unitData: unitData(required),
      })).toEqual([]);
    });

    test('an empty plan reports only the compulsory units', () => {
      expect(validatePlan({
        semesters: [],
        completedUnitCodes: [],
        requiredUnits: required,
      })).toEqual([
        { kind: 'compulsory_missing', unitCodes: ['REQ1', 'REQ2'] },
      ]);
    });
  });

  test('the same unit in two semesters is reported once, with both positions', () => {
    const units = [unit('DUPE')];
    const warnings = validatePlan({
      semesters: [bucket(2024, 1, units[0]), bucket(2024, 2, units[0])],
      completedUnitCodes: [],
      unitData: unitData(units),
    });

    expect(warnings).toEqual([
      {
        kind: 'duplicate_placement',
        unitCode: 'DUPE',
        positions: [{ year: 2024, semester: 1 }, { year: 2024, semester: 2 }],
      },
    ]);
  });

  test('an empty plan with nothing required is clean', () => {
    expect(validatePlan({ semesters: [], completedUnitCodes: [] })).toEqual([]);
  });
});
