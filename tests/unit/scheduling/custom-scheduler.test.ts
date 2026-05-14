import { buildCustomPlan, SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler';

describe('Custom Planner Scheduler Logic', () => {
  const remainingUnits: SchedulableUnit[] = [
    { 
      code: 'U1', 
      name: 'Unit 1', 
      category: 'core', 
      offeringSemesters: [1], 
      requisiteGroups: [] 
    },
    { 
      code: 'U2', 
      name: 'Unit 2', 
      category: 'core', 
      offeringSemesters: [1], 
      // FIX: requisiteGroups must match the RequisiteCondition interface
      requisiteGroups: [[{ type: 'unit', unitCode: 'U1', requisiteType: 'prerequisite' }]] 
    },
    { 
      code: 'MPU1', 
      name: 'MPU', 
      category: 'mpu', 
      offeringSemesters: [], 
      requisiteGroups: [] 
    }
  ];

  test('should satisfy prerequisites before placing units', () => {
    const result = buildCustomPlan(remainingUnits, [], 2024, 1);
  
    // Verify Semester 1 (2024 S1)
    // U1 and MPU1 should be placed here.
    expect(result.semesters.length).toBeGreaterThan(0);
    expect(result.semesters[0].units.some(u => u.code === 'U1')).toBe(true);
    expect(result.semesters[0].units.some(u => u.code === 'U2')).toBe(false);

    // Verify next placement (will be 2025 S1)
    // The scheduler skips empty semesters (2024 S2), so result.semesters[1] 
    // will be the 2025 S1 bucket where U2 is finally eligible.
    expect(result.semesters.length).toBeGreaterThan(1); 
    expect(result.semesters[1].units.some(u => u.code === 'U2')).toBe(true);
  });

  test('should cap MPU units to 1 per semester', () => {
    const manyMpu: SchedulableUnit[] = [
      { 
        code: 'M1', 
        name: 'M1', 
        category: 'mpu', 
        offeringSemesters: [], 
        requisiteGroups: [] 
      },
      { 
        code: 'M2', 
        name: 'M2', 
        category: 'mpu', 
        offeringSemesters: [], 
        requisiteGroups: [] 
      }
    ];
    
    const result = buildCustomPlan(manyMpu, [], 2024, 1);
    
    // Each semester should only contain 1 MPU unit
    expect(result.semesters[0].units.length).toBe(1);
    expect(result.semesters[1].units.length).toBe(1);
  });
});