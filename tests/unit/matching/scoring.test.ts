import { scorePlanners, applyWILExemption } from '../../../core/services/matching/scoringEngine';
import { DEFAULT_CONFIG } from '../../../core/shared/types/matching';
import type { PlannerTemplate, StudentProfile } from '../../../core/shared/types/matching';

describe('Scoring Engine (MM-05)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test.each([
    { slots: 4, hasWIL: false, exemption: 2, expected: 4 },
    { slots: 4, hasWIL: true, exemption: 2, expected: 2 },
    { slots: 1, hasWIL: true, exemption: 2, expected: 0 },
    { slots: 4, hasWIL: true, exemption: 0, expected: 4 },
  ])(
    'adjusts $slots elective slots to $expected when hasWIL=$hasWIL and exemption=$exemption',
    ({ slots, hasWIL, exemption, expected }) => {
      expect(applyWILExemption(slots, hasWIL, exemption)).toBe(expected);
    },
  );

  test('ignores completed units that do not belong to the planner', () => {
    const profile = {
      hasWIL: false,
      completedCore: new Set(['UNKNOWN']),
      completedMajorCore: new Set<string>(),
      completedPrescribed: new Set<string>(),
      completedFreeElectives: new Set<string>(),
    } as StudentProfile;
    const planner = {
      plannerID: 'p1',
      majorName: 'Computer Science',
      courseType: 'degree',
      intakeYear: 2024,
      intakeSemester: 1,
      durationSemesters: 8,
      requiredCore: ['CORE1'],
      requiredMajorCore: new Set(['MAJOR1']),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    } as PlannerTemplate;

    const [result] = scorePlanners(profile, [planner], DEFAULT_CONFIG);

    expect(result.coreMatched).toBe(0);
    expect(result.majorCoreMatched).toBe(0);
    expect(result.matchPct).toBe(25);
  });

  test('Phase 3: Perfect match should result in 100%', () => {
    const mockProfile = {
      hasWIL: true,
      completedCore: new Set(['CORE1']),
      completedMajorCore: new Set(['MAJOR1']),
      completedPrescribed: new Set(['PRE1']),
      completedFreeElectives: new Set(['FREE1', 'FREE2']),
    } as StudentProfile;

    const mockPlanner = {
      plannerID: 'p1',
      majorName: 'Computer Science',
      requiredCore: ['CORE1'],
      requiredMajorCore: new Set(['MAJOR1']),
      prescribedElectiveCategories: [{ categoryCode: 'E1', pool: new Set(['PRE1']), slots: 1 }],
      freeElectivePool: new Set(['FREE1', 'FREE2']),
      freeElectiveSlotsRequired: 4, // 4 total, but student has WIL so 2 required
    } as PlannerTemplate;

    const results = scorePlanners(mockProfile, [mockPlanner], DEFAULT_CONFIG);
    
    // Core (1/1 * 0.4) + Major (1/1 * 0.3) + Prescribed (1/1 * 0.2) + Free (2/2 * 0.05) + WIL (1 * 0.05) = 1.0
    expect(results[0].matchPct).toBe(100);
    expect(results[0].wilExemptionApplied).toBe(true);
    expect(results[0]).toMatchObject({
      coreMatched: 1,
      majorCoreMatched: 1,
      prescribedMatched: 1,
      prescribedPossible: 1,
      freeMatched: 2,
      freePossible: 2,
      missingFreeSlots: 0,
    });
  });
});
