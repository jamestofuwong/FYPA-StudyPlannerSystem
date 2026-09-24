import {
  buildCustomPlan,
  mapUnitToSchedulable,
  DEFAULT_SCHEDULER_CONFIG,
  validateSchedulerConfig,
  type PlanWarning,
  type SchedulableUnit,
} from '@core/services/scheduling/customPlannerScheduler';

function unit(
  code: string,
  overrides: Partial<SchedulableUnit> = {},
): SchedulableUnit {
  return {
    code,
    name: `Unit ${code}`,
    category: 'core',
    offeringSemesters: [],
    requisiteGroups: [],
    ...overrides,
  };
}

describe('Custom Planner Scheduler', () => {
  test('places prerequisites before dependent units', () => {
    const result = buildCustomPlan([
      unit('U1', { offeringSemesters: [1] }),
      unit('U2', {
        offeringSemesters: [1],
        requisiteGroups: [[{
          type: 'unit',
          unitCode: 'U1',
          requisiteType: 'prerequisite',
        }]],
      }),
    ], [], 2024, 1);

    expect(result.semesters).toEqual([
      {
        year: 2024,
        semester: 1,
        units: [{ code: 'U1', name: 'Unit U1', category: 'core' }],
      },
      {
        year: 2025,
        semester: 1,
        units: [{ code: 'U2', name: 'Unit U2', category: 'core' }],
      },
    ]);
    expect(result.unschedulableUnits).toEqual([]);
  });

  test('caps standard units at four and MPU units at one per semester', () => {
    const units = [
      ...Array.from({ length: 6 }, (_, index) => unit(`C${index + 1}`)),
      unit('M1', { category: 'mpu' }),
      unit('M2', { category: 'mpu' }),
    ];

    const result = buildCustomPlan(units, [], 2024, 1);

    expect(result.semesters[0].units.filter((item) => item.category !== 'mpu')).toHaveLength(4);
    expect(result.semesters[0].units.filter((item) => item.category === 'mpu')).toHaveLength(1);
    expect(result.semesters[1].units.map((item) => item.code)).toEqual(['C5', 'C6', 'M2']);
  });

  test('waits until a unit is offered and advances the academic year', () => {
    const result = buildCustomPlan([
      unit('SEM2', { offeringSemesters: [2] }),
      unit('NEXT-S1', {
        offeringSemesters: [1],
        requisiteGroups: [[{
          type: 'unit',
          unitCode: 'SEM2',
          requisiteType: 'prerequisite',
        }]],
      }),
    ], [], 2024, 1);

    expect(result.semesters.map(({ year, semester, units }) => ({
      year,
      semester,
      codes: units.map((item) => item.code),
    }))).toEqual([
      { year: 2024, semester: 2, codes: ['SEM2'] },
      { year: 2025, semester: 1, codes: ['NEXT-S1'] },
    ]);
  });

  test('allows a corequisite to be placed in the same semester', () => {
    const result = buildCustomPlan([
      unit('BASE'),
      unit('WITH-BASE', {
        requisiteGroups: [[{
          type: 'unit',
          unitCode: 'BASE',
          requisiteType: 'corequisite',
        }]],
      }),
    ], [], 2024, 1);

    expect(result.semesters[0].units.map((item) => item.code)).toEqual(['BASE', 'WITH-BASE']);
  });

  test('enforces antirequisites against completed and same-semester units', () => {
    const completedConflict = buildCustomPlan([
      unit('ADV', {
        requisiteGroups: [[{
          type: 'unit',
          unitCode: 'OLD',
          requisiteType: 'antirequisite',
        }]],
      }),
    ], [' old '], 2024, 1);

    const bucketConflict = buildCustomPlan([
      unit('OLD'),
      unit('ADV', {
        requisiteGroups: [[{
          type: 'unit',
          unitCode: 'OLD',
          requisiteType: 'antirequisite',
        }]],
      }),
    ], [], 2024, 1);

    expect(completedConflict.semesters).toEqual([]);
    expect(completedConflict.unschedulableUnits.map((item) => item.code)).toEqual(['ADV']);
    expect(bucketConflict.semesters[0].units.map((item) => item.code)).toEqual(['OLD']);
    expect(bucketConflict.unschedulableUnits.map((item) => item.code)).toEqual(['ADV']);
  });

  test('satisfies credit-point requisites from normalized completed units', () => {
    const result = buildCustomPlan([
      unit('CAPSTONE', {
        requisiteGroups: [[{ type: 'credit_points', creditPoints: 25 }]],
      }),
    ], ['done-1', ' DONE-2 '], 2024, 1);

    expect(result.semesters[0].units.map((item) => item.code)).toEqual(['CAPSTONE']);
    expect(result.unschedulableUnits).toEqual([]);
  });

  test('accepts any alternative requisite group that is fully satisfied', () => {
    const result = buildCustomPlan([
      unit('ELECTIVE', {
        requisiteGroups: [
          [{ type: 'unit', unitCode: 'MISSING', requisiteType: 'prerequisite' }],
          [{ type: 'credit_points', creditPoints: 12.5 }],
        ],
      }),
    ], ['COMPLETED'], 2024, 1);

    expect(result.semesters[0].units.map((item) => item.code)).toEqual(['ELECTIVE']);
  });

  test('returns permanently blocked units as unschedulable after two idle semesters', () => {
    const result = buildCustomPlan([
      unit('BLOCKED', {
        requisiteGroups: [[{
          type: 'unit',
          unitCode: 'NEVER-COMPLETED',
          requisiteType: 'prerequisite',
        }]],
      }),
    ], [], 2024, 1);

    expect(result.semesters).toEqual([]);
    expect(result.unschedulableUnits).toEqual([
      { code: 'BLOCKED', name: 'Unit BLOCKED', category: 'core' },
    ]);
  });

  // A failed unit (grade N or SN) is deliberately left out of completedUnitCodes
  // so the scheduler treats it as outstanding and places it as a retake.
  describe('failed units', () => {
    test('schedules a unit that is absent from completedUnitCodes', () => {
      const result = buildCustomPlan([unit('FAILED')], [], 2024, 1);

      expect(result.semesters[0].units.map((item) => item.code)).toEqual(['FAILED']);
      expect(result.unschedulableUnits).toEqual([]);
    });

    test('places a dependent unit strictly after the retake', () => {
      const result = buildCustomPlan([
        unit('FAILED'),
        unit('DEPENDENT', {
          requisiteGroups: [[{
            type: 'unit',
            unitCode: 'FAILED',
            requisiteType: 'prerequisite',
          }]],
        }),
      ], [], 2024, 1);

      const placement = (code: string) => {
        const index = result.semesters.findIndex((sem) =>
          sem.units.some((item) => item.code === code));
        return index;
      };

      expect(placement('FAILED')).toBeGreaterThanOrEqual(0);
      expect(placement('DEPENDENT')).toBeGreaterThan(placement('FAILED'));
      expect(result.unschedulableUnits).toEqual([]);
    });

    test('defers a Semester 1 only retake when anchored at Semester 2', () => {
      const result = buildCustomPlan(
        [unit('S1-ONLY', { offeringSemesters: [1] })],
        [],
        2024,
        2,
      );

      expect(result.semesters.map(({ year, semester, units }) => ({
        year,
        semester,
        codes: units.map((item) => item.code),
      }))).toEqual([
        { year: 2025, semester: 1, codes: ['S1-ONLY'] },
      ]);
    });

    // buildCustomPlan does not filter its own pool. /api/custom-planner drops
    // completedUnitCodes from remainingUnits before calling it. So a passed unit
    // stays out of the plan by being absent from the pool, and completedUnitCodes
    // only ever satisfies requisites.
    test('keeps a unit already in completedUnitCodes out of the plan', () => {
      const result = buildCustomPlan(
        [unit('OUTSTANDING', {
          requisiteGroups: [[{
            type: 'unit',
            unitCode: 'PASSED',
            requisiteType: 'prerequisite',
          }]],
        })],
        ['PASSED'],
        2024,
        1,
      );

      const scheduled = result.semesters.flatMap((sem) => sem.units.map((item) => item.code));
      expect(scheduled).toEqual(['OUTSTANDING']);
      expect(scheduled).not.toContain('PASSED');
      expect(result.unschedulableUnits).toEqual([]);
    });
  });

  // Bucket semesters count from the student's intake, offerings are calendar
  // terms. Slot 1 of a September intake is calendar Semester 2.
  describe('intake-relative vs calendar terms', () => {
    const placements = (result: ReturnType<typeof buildCustomPlan>) =>
      result.semesters.map(({ year, semester, units }) => ({
        year,
        semester,
        codes: units.map((item) => item.code),
      }));

    test('Feb/Mar intake defers a Semester 2 only unit from slot 1 to slot 2', () => {
      const result = buildCustomPlan(
        [unit('S2-ONLY', { offeringSemesters: [2] })],
        [],
        2024,
        1,
        1,
      );

      expect(placements(result)).toEqual([
        { year: 2024, semester: 2, codes: ['S2-ONLY'] },
      ]);
    });

    test('September intake places a Semester 2 only unit in slot 1', () => {
      const result = buildCustomPlan(
        [unit('S2-ONLY', { offeringSemesters: [2] })],
        [],
        2024,
        1,
        2,
      );

      expect(placements(result)).toEqual([
        { year: 2024, semester: 1, codes: ['S2-ONLY'] },
      ]);
    });

    test('September intake defers a Semester 1 only unit from slot 1 to slot 2', () => {
      const result = buildCustomPlan(
        [unit('S1-ONLY', { offeringSemesters: [1] })],
        [],
        2024,
        1,
        2,
      );

      expect(placements(result)).toEqual([
        { year: 2024, semester: 2, codes: ['S1-ONLY'] },
      ]);
    });

    test('omitting the intake semester behaves as a Feb/Mar intake', () => {
      const units = () => [
        unit('S1-ONLY', { offeringSemesters: [1] }),
        unit('S2-ONLY', { offeringSemesters: [2] }),
        unit('ANY'),
        unit('AFTER-S1', {
          offeringSemesters: [2],
          requisiteGroups: [[{
            type: 'unit',
            unitCode: 'S1-ONLY',
            requisiteType: 'prerequisite',
          }]],
        }),
      ];

      const omitted = buildCustomPlan(units(), [], 2024, 2);
      const explicit = buildCustomPlan(units(), [], 2024, 2, 1);

      expect(omitted).toEqual(explicit);
      expect(placements(omitted)).toEqual([
        { year: 2024, semester: 2, codes: ['S2-ONLY', 'ANY'] },
        { year: 2025, semester: 1, codes: ['S1-ONLY'] },
        { year: 2025, semester: 2, codes: ['AFTER-S1'] },
      ]);
    });

    test('September intake buckets keep slot numbers, not calendar terms', () => {
      const result = buildCustomPlan(
        [
          unit('S2-ONLY', { offeringSemesters: [2] }),
          unit('S1-AFTER', {
            offeringSemesters: [1],
            requisiteGroups: [[{
              type: 'unit',
              unitCode: 'S2-ONLY',
              requisiteType: 'prerequisite',
            }]],
          }),
        ],
        [],
        2024,
        2,
        2,
      );

      // Slot 2 of a September intake is calendar Semester 1, so S2-ONLY waits
      // for slot 1 of the next year (calendar Semester 2).
      expect(placements(result)).toEqual([
        { year: 2025, semester: 1, codes: ['S2-ONLY'] },
        { year: 2025, semester: 2, codes: ['S1-AFTER'] },
      ]);
      expect(result.semesters.map((bucket) => bucket.semester)).toEqual([1, 2]);
    });
  });

  // mapUnitToSchedulable converts a raw DB unit row into the SchedulableUnit shape canTake() understands.
  // It used to be a private, untested toSchedulable() inline in web/app/api/custom-planner/route.ts, moved
  // here and exported so both that route and core/services/classEstimation/eligibilityEngine.ts share one
  // mapping instead of two copies. These tests cover what was previously untested.
  describe('mapUnitToSchedulable', () => {
    test('maps a plain unit row with no requisites', () => {
      const result = mapUnitToSchedulable(
        { unit_code: 'COS10009', unit_name: 'Intro', offerings: [{ offered_in: 1 }], requisite_groups: [] },
        'core',
      );
      expect(result).toEqual({
        code: 'COS10009', name: 'Intro', category: 'core', offeringSemesters: [1], requisiteGroups: [],
      });
    });

    test('drops summer/winter offering terms (3, 4), canTake only cycles semesters 1 and 2', () => {
      const result = mapUnitToSchedulable(
        { unit_code: 'U1', unit_name: 'X', offerings: [{ offered_in: 1 }, { offered_in: 3 }, { offered_in: 4 }], requisite_groups: [] },
        'core',
      );
      expect(result.offeringSemesters).toEqual([1]);
    });

    test('defaults requisite_type to prerequisite when missing, and uppercases the related unit code', () => {
      const result = mapUnitToSchedulable(
        {
          unit_code: 'U1', unit_name: 'X', offerings: [],
          requisite_groups: [{ conditions: [{ type: 'unit', requisite_type: null, credit_points: null, unit: { unit_code: 'base' } }] }],
        },
        'core',
      );
      expect(result.requisiteGroups).toEqual([[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]]);
    });

    test('maps a credit_points condition', () => {
      const result = mapUnitToSchedulable(
        {
          unit_code: 'U1', unit_name: 'X', offerings: [],
          requisite_groups: [{ conditions: [{ type: 'credit_points', requisite_type: null, credit_points: 50, unit: null }] }],
        },
        'core',
      );
      expect(result.requisiteGroups).toEqual([[{ type: 'credit_points', creditPoints: 50 }]]);
    });

    test('drops a condition pointing to a null unit relation', () => {
      const result = mapUnitToSchedulable(
        {
          unit_code: 'U1', unit_name: 'X', offerings: [],
          requisite_groups: [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: null }] }],
        },
        'core',
      );
      expect(result.requisiteGroups).toEqual([]);
    });

    // Without this filter, a group that becomes empty after dropping invalid conditions would make the
    // unit trivially eligible via that group (every() on an empty array is vacuously true), instead of
    // being ignored as the broken data it is.
    test('drops a group left with no valid conditions, instead of leaving it as an always-satisfied empty group', () => {
      const result = mapUnitToSchedulable(
        {
          unit_code: 'U1', unit_name: 'X', offerings: [],
          requisite_groups: [
            { conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: null }] },
            { conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: 'BASE' } }] },
          ],
        },
        'core',
      );
      expect(result.requisiteGroups).toEqual([[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'BASE' }]]);
    });
  });

  const warningsOf = <K extends PlanWarning['kind']>(
    result: ReturnType<typeof buildCustomPlan>,
    kind: K,
  ) => result.warnings.filter((w): w is Extract<PlanWarning, { kind: K }> => w.kind === kind);

  const prereq = (code: string) => ({ type: 'unit' as const, unitCode: code, requisiteType: 'prerequisite' as const });

  describe('scheduler config', () => {
    const backlog = (n: number) => Array.from({ length: n }, (_, index) => unit(`C${index + 1}`));

    test('omitting the config behaves exactly as the defaults', () => {
      const units = () => [...backlog(6), unit('M1', { category: 'mpu' }), unit('M2', { category: 'mpu' })];
      const omitted = buildCustomPlan(units(), [], 2024, 1);
      const explicit = buildCustomPlan(units(), [], 2024, 1, 1, [], DEFAULT_SCHEDULER_CONFIG);
      const empty = buildCustomPlan(units(), [], 2024, 1, 1, [], {});

      expect(omitted).toEqual(explicit);
      expect(omitted).toEqual(empty);
      expect(omitted.semesters.map((s) => s.units.length)).toEqual([5, 3]);
      expect(warningsOf(omitted, 'over_capacity')).toEqual([]);
    });

    test('maxStandardPerSemester: 5 places five standard units in one semester', () => {
      const result = buildCustomPlan(backlog(6), [], 2024, 1, 1, [], { maxStandardPerSemester: 5 });

      expect(result.semesters[0].units.map((u) => u.code)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
      expect(result.semesters[1].units.map((u) => u.code)).toEqual(['C6']);
      expect(warningsOf(result, 'over_capacity')).toEqual([
        { kind: 'over_capacity', year: 2024, semester: 1, count: 5, limit: 4 },
      ]);
    });

    test('perSemesterOverrides only changes the named bucket', () => {
      const result = buildCustomPlan(backlog(10), [], 2024, 1, 1, [], {
        perSemesterOverrides: { '2024-1': 5 },
      });

      expect(result.semesters.map(({ year, semester, units }) => [year, semester, units.length])).toEqual([
        [2024, 1, 5],
        [2024, 2, 4],
        [2025, 1, 1],
      ]);
      expect(warningsOf(result, 'over_capacity')).toEqual([
        { kind: 'over_capacity', year: 2024, semester: 1, count: 5, limit: 4 },
      ]);
    });

    test('override keys use the slot semester, not the calendar term', () => {
      // September intake: slot 1 is calendar Semester 2, but the key is still "2024-1"
      const result = buildCustomPlan(backlog(5), [], 2024, 1, 2, [], {
        perSemesterOverrides: { '2024-1': 5 },
      });

      expect(result.semesters[0]).toMatchObject({ year: 2024, semester: 1 });
      expect(result.semesters[0].units).toHaveLength(5);
    });

    test('creditPointsPerUnit changes the credit total requisites see', () => {
      const capstone = () => unit('CAPSTONE', { requisiteGroups: [[{ type: 'credit_points', creditPoints: 25 }]] });

      expect(buildCustomPlan([capstone()], ['DONE'], 2024, 1).unschedulableUnits).toHaveLength(1);
      expect(buildCustomPlan([capstone()], ['DONE'], 2024, 1, 1, [], { creditPointsPerUnit: 25 }).unschedulableUnits)
        .toEqual([]);
    });
  });

  describe('warnings', () => {
    test('running out of semesters is budget_exhausted, not requisite_violation', () => {
      const result = buildCustomPlan(
        Array.from({ length: 10 }, (_, index) => unit(`C${index + 1}`)),
        [],
        2024,
        1,
        1,
        [],
        { maxSemesters: 2 },
      );

      expect(result.semesters).toHaveLength(2);
      expect(result.unschedulableUnits.map((u) => u.code)).toEqual(['C9', 'C10']);
      expect(warningsOf(result, 'budget_exhausted')).toEqual([
        { kind: 'budget_exhausted', unitCodes: ['C9', 'C10'] },
      ]);
      expect(warningsOf(result, 'requisite_violation')).toEqual([]);
    });

    test('a unit whose prerequisite is not in the plan names the missing code', () => {
      const result = buildCustomPlan(
        [unit('COS30049', { requisiteGroups: [[prereq('COS20007'), prereq('COS10009')]] })],
        ['COS10009'],
        2024,
        1,
      );

      expect(result.unschedulableUnits.map((u) => u.code)).toEqual(['COS30049']);
      expect(warningsOf(result, 'requisite_violation')).toEqual([
        { kind: 'requisite_violation', unitCode: 'COS30049', missing: ['COS20007'] },
      ]);
      expect(warningsOf(result, 'budget_exhausted')).toEqual([]);
    });

    test('an impossible prerequisite is still named when the budget also runs out', () => {
      const result = buildCustomPlan(
        [unit('BLOCKED', { requisiteGroups: [[prereq('NEVER')]] }), unit('A'), unit('B')],
        [],
        2024,
        1,
        1,
        [],
        { maxSemesters: 1, maxStandardPerSemester: 1 },
      );

      expect(warningsOf(result, 'requisite_violation')).toEqual([
        { kind: 'requisite_violation', unitCode: 'BLOCKED', missing: ['NEVER'] },
      ]);
      expect(warningsOf(result, 'budget_exhausted')).toEqual([
        { kind: 'budget_exhausted', unitCodes: ['B'] },
      ]);
    });

    test('a unit stalled behind another unplaced unit names that unit', () => {
      const result = buildCustomPlan(
        [
          unit('ROOT', { requisiteGroups: [[prereq('NEVER')]] }),
          unit('CHILD', { requisiteGroups: [[prereq('ROOT')]] }),
        ],
        [],
        2024,
        1,
      );

      expect(warningsOf(result, 'requisite_violation')).toEqual([
        { kind: 'requisite_violation', unitCode: 'ROOT', missing: ['NEVER'] },
        { kind: 'requisite_violation', unitCode: 'CHILD', missing: ['ROOT'] },
      ]);
    });

    test('an antirequisite already taken is reported as a conflict', () => {
      const result = buildCustomPlan(
        [unit('ADV', { requisiteGroups: [[{ type: 'unit', unitCode: 'OLD', requisiteType: 'antirequisite' }]] })],
        ['OLD'],
        2024,
        1,
      );

      expect(warningsOf(result, 'requisite_violation')).toEqual([
        { kind: 'requisite_violation', unitCode: 'ADV', missing: [], conflictsWith: ['OLD'] },
      ]);
    });

    test('a summer/winter-only unit is not placed and emits short_term_only', () => {
      const result = buildCustomPlan(
        [
          unit('MPU3212', { category: 'mpu', allOfferingTerms: [3, 4] }),
          unit('ICT20016*Optional', { category: 'wil', allOfferingTerms: [4] }),
          unit('ANY'),
        ],
        [],
        2024,
        1,
      );

      expect(result.semesters.flatMap((s) => s.units.map((u) => u.code))).toEqual(['ANY']);
      expect(result.unschedulableUnits.map((u) => u.code)).toEqual(['MPU3212', 'ICT20016*Optional']);
      expect(warningsOf(result, 'short_term_only')).toEqual([
        { kind: 'short_term_only', unitCode: 'MPU3212', offeringTerms: [3, 4] },
        { kind: 'short_term_only', unitCode: 'ICT20016*Optional', offeringTerms: [4] },
      ]);
    });

    test('a unit offered in a semester and a short term is placed in the semester', () => {
      const result = buildCustomPlan(
        [unit('ICT20016', { offeringSemesters: [2], allOfferingTerms: [2, 3, 4] })],
        [],
        2024,
        1,
      );

      expect(result.semesters).toEqual([
        { year: 2024, semester: 2, units: [{ code: 'ICT20016', name: 'Unit ICT20016', category: 'core' }] },
      ]);
      expect(result.warnings).toEqual([]);
    });

    test('a unit with no offering data is still placed and emits no_offering_data', () => {
      const result = buildCustomPlan([unit('NODATA', { allOfferingTerms: [] })], [], 2024, 1);

      expect(result.semesters[0]).toMatchObject({ year: 2024, semester: 1 });
      expect(result.semesters[0].units.map((u) => u.code)).toEqual(['NODATA']);
      expect(result.unschedulableUnits).toEqual([]);
      expect(warningsOf(result, 'no_offering_data')).toEqual([
        { kind: 'no_offering_data', unitCode: 'NODATA' },
      ]);
    });

    test('a unit with offering data does not emit no_offering_data', () => {
      const result = buildCustomPlan(
        [unit('KNOWN', { offeringSemesters: [1, 2], allOfferingTerms: [1, 2] })],
        [],
        2024,
        1,
      );

      expect(warningsOf(result, 'no_offering_data')).toEqual([]);
    });
  });

  describe('Conceded Pass', () => {
    test('does not satisfy a prerequisite', () => {
      const result = buildCustomPlan(
        [unit('NEXT', { requisiteGroups: [[prereq('BASE')]] })],
        ['BASE'],
        2024,
        1,
        1,
        ['BASE'],
      );

      expect(result.unschedulableUnits.map((u) => u.code)).toEqual(['NEXT']);
      expect(warningsOf(result, 'requisite_violation')).toEqual([
        { kind: 'requisite_violation', unitCode: 'NEXT', missing: ['BASE'], concededPass: ['BASE'] },
      ]);
    });

    test('does not satisfy a corequisite', () => {
      const result = buildCustomPlan(
        [unit('WITH', { requisiteGroups: [[{ type: 'unit', unitCode: 'BASE', requisiteType: 'corequisite' }]] })],
        ['BASE'],
        2024,
        1,
        1,
        ['base'],
      );

      expect(result.unschedulableUnits.map((u) => u.code)).toEqual(['WITH']);
    });

    test('still satisfies the same prerequisite when it was a full pass', () => {
      const result = buildCustomPlan(
        [unit('NEXT', { requisiteGroups: [[prereq('BASE')]] })],
        ['BASE'],
        2024,
        1,
      );

      expect(result.unschedulableUnits).toEqual([]);
    });

    test('still counts as taken for an antirequisite', () => {
      const result = buildCustomPlan(
        [unit('ALT', { requisiteGroups: [[{ type: 'unit', unitCode: 'BASE', requisiteType: 'antirequisite' }]] })],
        [],
        2024,
        1,
        1,
        ['BASE'],
      );

      expect(result.unschedulableUnits.map((u) => u.code)).toEqual(['ALT']);
      expect(warningsOf(result, 'requisite_violation')).toEqual([
        { kind: 'requisite_violation', unitCode: 'ALT', missing: [], conflictsWith: ['BASE'] },
      ]);
    });

    test('counts toward credit points', () => {
      const result = buildCustomPlan(
        [unit('CAPSTONE', { requisiteGroups: [[{ type: 'credit_points', creditPoints: 25 }]] })],
        ['DONE'],
        2024,
        1,
        1,
        ['BASE'],
      );

      expect(result.semesters[0].units.map((u) => u.code)).toEqual(['CAPSTONE']);
    });

    test('an alternative group without the CP still works', () => {
      const result = buildCustomPlan(
        [unit('NEXT', { requisiteGroups: [[prereq('BASE')], [prereq('OTHER')]] })],
        ['BASE', 'OTHER'],
        2024,
        1,
        1,
        ['BASE'],
      );

      expect(result.unschedulableUnits).toEqual([]);
    });
  });

  describe('validateSchedulerConfig', () => {
    test('accepts nothing and a valid partial config', () => {
      expect(validateSchedulerConfig(undefined)).toEqual({ ok: true, config: {} });
      expect(validateSchedulerConfig({ maxStandardPerSemester: 5, perSemesterOverrides: { '3-1': 5 } }))
        .toEqual({ ok: true, config: { maxStandardPerSemester: 5, perSemesterOverrides: { '3-1': 5 } } });
    });

    test.each([
      ['not an object', 'five'],
      ['an array', [5]],
      ['an unknown field', { maxUnits: 5 }],
      ['a zero cap', { maxStandardPerSemester: 0 }],
      ['a fractional cap', { maxMpuPerSemester: 1.5 }],
      ['a negative cap', { maxMpuPerSemester: -1 }],
      ['too many semesters', { maxSemesters: 41 }],
      ['zero semesters', { maxSemesters: 0 }],
      ['zero credit points', { creditPointsPerUnit: 0 }],
      ['non-numeric credit points', { creditPointsPerUnit: '12.5' }],
      ['a malformed override key', { perSemesterOverrides: { 'Y3S1': 5 } }],
      ['a calendar term override key', { perSemesterOverrides: { '3-3': 5 } }],
      ['a non-integer override', { perSemesterOverrides: { '3-1': 4.5 } }],
    ])('rejects %s', (_label, input) => {
      const result = validateSchedulerConfig(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/config/);
    });
  });
});
