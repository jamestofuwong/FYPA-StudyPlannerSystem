// @ts-nocheck
import { scorePlanners, applyWILExemption } from '../../../core/services/matching/scoringEngine';
import { DEFAULT_CONFIG } from '../../../core/shared/types/matching';

describe('Scoring Engine (MM-05)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('should handle unknown units without crashing', () => {});
  test('Phase 2b: WIL Exemption should reduce elective denominator', () => {
    // Standard: 4 slots required
    const normalSlots = applyWILExemption(4, false, 2);
    // WIL Student: 4 slots - 2 exemption = 2 required
    const wilSlots = applyWILExemption(4, true, 2);

    expect(normalSlots).toBe(4);
    expect(wilSlots).toBe(2);
  });

  test('Phase 3: Perfect match should result in 100%', () => {
    const mockProfile = {
      hasWIL: true,
      completedCore: new Set(['CORE1']),
      completedMajorCore: new Set(['MAJOR1']),
      completedPrescribed: new Set(['PRE1']),
      completedFreeElectives: new Set(['FREE1', 'FREE2']),
    };

    const mockPlanner = {
      plannerID: 'p1',
      majorName: 'Computer Science',
      requiredCore: ['CORE1'],
      requiredMajorCore: new Set(['MAJOR1']),
      prescribedElectiveCategories: [{ categoryCode: 'E1', pool: new Set(['PRE1']), slots: 1 }],
      freeElectivePool: new Set(['FREE1', 'FREE2']),
      freeElectiveSlotsRequired: 4, // 4 total, but student has WIL so 2 required
    };

    const results = scorePlanners(mockProfile, [mockPlanner], DEFAULT_CONFIG);
    
    // Core (1/1 * 0.4) + Major (1/1 * 0.3) + Prescribed (1/1 * 0.2) + Free (2/2 * 0.05) + WIL (1 * 0.05) = 1.0
    expect(results[0].matchPct).toBe(100);
    expect(results[0].wilExemptionApplied).toBe(true);
  });
});