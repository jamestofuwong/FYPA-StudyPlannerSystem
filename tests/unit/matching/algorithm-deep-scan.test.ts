import { scorePlanners, applyWILExemption } from '@core/services/matching/scoringEngine';
import { DEFAULT_CONFIG } from '@shared/types/matching';

describe('Matching Algorithm Deep Coverage', () => {
  const mockProfile = {
    hasWIL: true,
    completedCore: new Set(['COS10001']),
    completedMajorCore: new Set(['TNE10006']),
    completedPrescribed: new Set([]),
    completedFreeElectives: new Set([]),
    requisiteFlags: []
  } as any;

  test('Phase 2b: WIL Exemption correctly reduces elective denominator', () => {
    // If student has WIL, 2 elective slots (25 CP) should be removed from requirement
    const result = applyWILExemption(4, true, 2);
    expect(result).toBe(2);
    
    expect(applyWILExemption(1, true, 2)).toBe(0);
  });

  test('Phase 3: Handles edge case of zero required units (Prevent Division by Zero)', () => {
    const emptyPlanner = {
      plannerID: 'empty',
      requiredCore: [], // Zero core
      requiredMajorCore: new Set(),
      prescribedElectiveCategories: [],
      freeElectiveSlotsRequired: 0,
      freeElectivePool: new Set()
    } as any;

    const scores = scorePlanners(mockProfile, [emptyPlanner], DEFAULT_CONFIG);
    expect(scores[0].matchPct).toBeDefined();
    expect(Number.isFinite(scores[0].matchPct)).toBe(true);
  });
});