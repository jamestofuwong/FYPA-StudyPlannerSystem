import { detectMajors } from '@core/services/matching/majorDetector';

describe('MajorDetector tie-breakers and overrides', () => {
  const mockScores = [
    { plannerID: 'p1', majorCoreScore: 0.8, matchPct: 80 },
    { plannerID: 'p2', majorCoreScore: 0.8, matchPct: 70 }
  ] as any;

  test('falls back to the highest match when a manual override ID is unknown', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const config = { noMajorThreshold: 0.1, secondMajorThreshold: 0.5 };
    
    // Provide an override ID that DOES NOT EXIST in the scores to trigger the warning
    const result = detectMajors(mockScores, config as any, { manualOverride: 'non-existent' } as any);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to algorithm result'));
    expect(result.status).toBe('detected');
    expect(result.primaryMajor?.plannerID).toBe('p1');
    expect(result.rankedPlanners.map((planner) => planner.plannerID)).toEqual(['p1', 'p2']);
    
    warnSpy.mockRestore();
  });
});
