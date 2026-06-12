import { scorePlanners, applyWILExemption } from '@core/services/matching/scoringEngine';
import { DEFAULT_CONFIG } from '@shared/types/matching';

describe('Matching scoring edge cases', () => {
  const mockProfile = {
    hasWIL: true,
    completedCore: new Set(['COS10001']),
    completedMajorCore: new Set(['TNE10006']),
    completedPrescribed: new Set([]),
    completedFreeElectives: new Set([]),
    requisiteFlags: []
  } as any;

  test('WIL exemption reduces elective slots without becoming negative', () => {
    const result = applyWILExemption(4, true, 2);
    expect(result).toBe(2);
    
    expect(applyWILExemption(1, true, 2)).toBe(0);
  });

  test('zero required units produce a finite deterministic score', () => {
    const emptyPlanner = {
      plannerID: 'empty',
      requiredCore: [], // Zero core
      requiredMajorCore: new Set(),
      prescribedElectiveCategories: [],
      freeElectiveSlotsRequired: 0,
      freeElectivePool: new Set()
    } as any;

    const scores = scorePlanners(mockProfile, [emptyPlanner], DEFAULT_CONFIG);
    expect(scores).toHaveLength(1);
    expect(scores[0].matchPct).toBe(30);
    expect(Number.isFinite(scores[0].matchPct)).toBe(true);
    expect(scores[0]).toMatchObject({
      coreMatched: 0,
      majorCoreMatched: 0,
      prescribedMatched: 0,
      freeMatched: 0,
      missingFreeSlots: 0,
    });
  });
});
