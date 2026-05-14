import { buildCustomPlan } from '@core/services/scheduling/customPlannerScheduler';

describe('Custom Planner Scheduler Logic', () => {
  const remainingUnits = [
    { code: 'U1', name: 'Unit 1', category: 'core', offeringSemesters: [1], prerequisiteGroups: [] },
    { code: 'U2', name: 'Unit 2', category: 'core', offeringSemesters: [1], prerequisiteGroups: [['U1']] }, 
    { code: 'MPU1', name: 'MPU', category: 'mpu', offeringSemesters: [], prerequisiteGroups: [] }
  ];

  test('should satisfy prerequisites before placing units', () => {
    const result = buildCustomPlan(remainingUnits, [], 2024, 1);
    
    // Semester 1: U1 placed, U2 blocked
    expect(result.semesters[0].units.some(u => u.code === 'U1')).toBe(true);
    expect(result.semesters[0].units.some(u => u.code === 'U2')).toBe(false);

    // Semester 2: U2 is now eligible (U1 done)
    expect(result.semesters[1].units.some(u => u.code === 'U2')).toBe(true);
  });

  test('should cap MPU units to 1 per semester', () => {
    const manyMpu = [
        { code: 'M1', name: 'M1', category: 'mpu', offeringSemesters: [], prerequisiteGroups: [] },
        { code: 'M2', name: 'M2', category: 'mpu', offeringSemesters: [], prerequisiteGroups: [] }
    ];
    const result = buildCustomPlan(manyMpu, [], 2024, 1);
    expect(result.semesters[0].units.length).toBe(1);
  });
});