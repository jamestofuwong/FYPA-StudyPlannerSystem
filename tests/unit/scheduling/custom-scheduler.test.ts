import {
  buildCustomPlan,
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
});
