import {
  buildCustomPlan,
  mapUnitToSchedulable,
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
});
