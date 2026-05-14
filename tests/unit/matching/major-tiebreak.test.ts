import { detectMajors } from '@core/services/matching/majorDetector';

describe('MajorDetector: Tie-breakers and Overrides', () => {
  const mockScores = [
    { plannerID: 'p1', majorCoreScore: 0.8, matchPct: 80 },
    { plannerID: 'p2', majorCoreScore: 0.8, matchPct: 70 }
  ] as any;

  test('handles manual override fallback warning (Lines 123-131)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const config = { noMajorThreshold: 0.1, secondMajorThreshold: 0.5 };
    
    // Provide an override ID that DOES NOT EXIST in the scores to trigger the warning
    detectMajors(mockScores, config as any, { manualOverride: 'non-existent' } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to algorithm result'));
    
    warnSpy.mockRestore();
  });
});