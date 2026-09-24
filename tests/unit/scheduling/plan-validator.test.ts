import { carryForwardWarnings, validatePlan } from '@core/shared/scheduling/planValidator';
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

  // The seed records these per planner, e.g. 8 core units totalling 100 credit
  // points, and 1 WIL unit totalling 25.
  describe('requirement shortfalls', () => {
    const coreUnits = ['CORE1', 'CORE2'].map((c) => unit(c));
    const electives = ['E1', 'E2'].map((c) => unit(c, { category: 'elective' }));
    const wil = unit('ICT20016', { category: 'wil' });
    const all = [...coreUnits, ...electives, wil];

    const requirements = [
      { category: 'core', creditPoints: 25, unitCount: 2, planCategories: ['core'] },
      { category: 'elective', creditPoints: 25, unitCount: 2, planCategories: ['elective', 'prescribed_elective'] },
      { category: 'wil', creditPoints: 25, unitCount: 1, planCategories: ['wil'] },
    ];

    test('a complete plan reports no shortfall', () => {
      expect(validatePlan({
        semesters: [bucket(2024, 1, ...coreUnits, ...electives, wil)],
        completedUnitCodes: [],
        unitData: unitData(all),
        requirements,
      }).filter((w) => w.kind === 'requirement_shortfall')).toEqual([]);
    });

    test('a WIL unit counts 25 credit points, so one satisfies the category', () => {
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, wil)],
        completedUnitCodes: [],
        unitData: unitData(all),
        requirements: [requirements[2]],
      });
      expect(warnings.filter((w) => w.kind === 'requirement_shortfall')).toEqual([]);
    });

    test('removing an elective reports the gap with have and need', () => {
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, ...coreUnits, electives[0], wil)],
        completedUnitCodes: [],
        unitData: unitData(all),
        requirements,
      });
      expect(warnings.filter((w) => w.kind === 'requirement_shortfall')).toEqual([
        { kind: 'requirement_shortfall', category: 'elective', have: 12.5, need: 25 },
      ]);
    });

    test('swapping one elective for another reports nothing', () => {
      const swapped = unit('E3', { category: 'elective' });
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, ...coreUnits, electives[0], swapped, wil)],
        completedUnitCodes: [],
        unitData: unitData([...all, swapped]),
        requirements,
      });
      expect(warnings.filter((w) => w.kind === 'requirement_shortfall')).toEqual([]);
    });

    test('prescribed electives count toward the elective requirement', () => {
      const prescribed = unit('P1', { category: 'prescribed_elective' });
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, electives[0], prescribed)],
        completedUnitCodes: [],
        unitData: unitData([...all, prescribed]),
        requirements: [requirements[1]],
      });
      expect(warnings.filter((w) => w.kind === 'requirement_shortfall')).toEqual([]);
    });

    test('completed units count toward the total', () => {
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, electives[0])],
        completedUnitCodes: ['E2'],
        unitData: unitData(all),
        requirements: [requirements[1]],
      });
      expect(warnings.filter((w) => w.kind === 'requirement_shortfall')).toEqual([]);
    });

    test("a unit's own credit points win over the derived rate", () => {
      const heavy = unit('BIG', { category: 'elective', creditPoints: 25 });
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, heavy)],
        completedUnitCodes: [],
        unitData: unitData([heavy]),
        requirements: [requirements[1]],
      });
      expect(warnings.filter((w) => w.kind === 'requirement_shortfall')).toEqual([]);
    });

    test('a null unit count falls back to the default rate', () => {
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, electives[0])],
        completedUnitCodes: [],
        unitData: unitData(all),
        requirements: [{ category: 'elective', creditPoints: 25, unitCount: null, planCategories: ['elective'] }],
      });
      expect(warnings).toEqual([
        { kind: 'requirement_shortfall', category: 'elective', have: 12.5, need: 25 },
      ]);
    });

    test('a requirement the planner never recorded is skipped, not treated as zero', () => {
      // The route leaves null requirements out entirely
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, ...coreUnits)],
        completedUnitCodes: [],
        unitData: unitData(all),
        requirements: [requirements[0]],
      });
      expect(kinds(warnings)).not.toContain('requirement_shortfall');
    });

    test('omitting requirements skips the check entirely', () => {
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, electives[0])],
        completedUnitCodes: [],
        unitData: unitData(all),
      });
      expect(kinds(warnings)).not.toContain('requirement_shortfall');
    });
  });

  // A unit the advisor added from the catalogue is on no planner, so the page
  // has to put it in unitData itself. These cover what that buys.
  describe('units added from outside the planner', () => {
    const outside = unit('SWE30009', {
      category: 'elective',
      outsidePlanner: true,
      requisiteGroups: [[prereq('COS20007')]],
    });
    const gate = unit('COS20007');

    test('its requisites are checked once it is in unitData', () => {
      const warnings = validatePlan({
        // Placed a semester before the prerequisite it depends on
        semesters: [bucket(2024, 1, outside), bucket(2024, 2, gate)],
        completedUnitCodes: [],
        unitData: unitData([outside, gate]),
      });

      expect(warnings).toContainEqual({
        kind: 'requisite_violation',
        unitCode: 'SWE30009',
        missing: ['COS20007'],
      });
    });

    test('without it in unitData the requisite is never checked', () => {
      const warnings = validatePlan({
        semesters: [bucket(2024, 1, outside), bucket(2024, 2, gate)],
        completedUnitCodes: [],
        unitData: unitData([gate]),
      });

      expect(kinds(warnings)).not.toContain('requisite_violation');
      expect(warnings).toContainEqual({ kind: 'no_offering_data', unitCode: 'SWE30009' });
    });

    test('it counts toward the elective requirement', () => {
      const requirement = [
        { category: 'elective', creditPoints: 25, unitCount: 2, planCategories: ['elective', 'prescribed_elective'] },
      ];
      const oneElective = unit('E1', { category: 'elective' });

      const short = validatePlan({
        semesters: [bucket(2024, 1, oneElective)],
        completedUnitCodes: [],
        unitData: unitData([oneElective]),
        requirements: requirement,
      });
      expect(short).toContainEqual({ kind: 'requirement_shortfall', category: 'elective', have: 12.5, need: 25 });

      const whole = validatePlan({
        semesters: [bucket(2024, 1, oneElective), bucket(2024, 2, outside)],
        completedUnitCodes: ['COS20007'],
        unitData: unitData([oneElective, outside]),
        requirements: requirement,
      });
      expect(kinds(whole)).not.toContain('requirement_shortfall');
    });
  });
});

describe('carryForwardWarnings', () => {
  const shortTerm: PlanWarning = { kind: 'short_term_only', unitCode: 'MPU3212', offeringTerms: [3, 4] };
  const budget: PlanWarning = { kind: 'budget_exhausted', unitCodes: ['A', 'B'] };
  const placedBucket = (...codes: string[]): CustomSemesterBucket => ({
    year: 2024,
    semester: 1,
    units: codes.map((code) => ({ code, name: `Unit ${code}`, category: 'core' })),
  });

  test('an unplaced short-term unit keeps its warning after an unrelated edit', () => {
    expect(carryForwardWarnings([shortTerm], [placedBucket('OTHER')])).toEqual([shortTerm]);
  });

  test('a short-term unit the advisor has placed loses the carried warning', () => {
    expect(carryForwardWarnings([shortTerm], [placedBucket('MPU3212')])).toEqual([]);
  });

  test('budget_exhausted keeps only the codes still unplaced', () => {
    expect(carryForwardWarnings([budget], [placedBucket('A')])).toEqual([
      { kind: 'budget_exhausted', unitCodes: ['B'] },
    ]);
  });

  test('budget_exhausted disappears once every code is placed', () => {
    expect(carryForwardWarnings([budget], [placedBucket('A', 'B')])).toEqual([]);
  });

  test('warnings about placed units are dropped, since validatePlan judges those', () => {
    const placedWarnings: PlanWarning[] = [
      { kind: 'requisite_violation', unitCode: 'X', missing: ['Y'] },
      { kind: 'over_capacity', year: 2024, semester: 1, count: 5, limit: 4 },
      { kind: 'no_offering_data', unitCode: 'Z' },
    ];
    expect(carryForwardWarnings(placedWarnings, [placedBucket('OTHER')])).toEqual([]);
  });

  test('is case insensitive about placement', () => {
    expect(carryForwardWarnings([shortTerm], [placedBucket('mpu3212')])).toEqual([]);
  });
});
