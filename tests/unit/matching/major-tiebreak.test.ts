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

// Regression: the second major was simply rank 2, so it could be the planner the primary major came from, or
// another version of the same major.
describe('MajorDetector second major', () => {
  const config = { noMajorThreshold: 0.1, secondMajorThreshold: 0.5 } as any;
  const rec = (plannerID: string, majorName: string, majorCoreScore: number, matchPct: number) =>
    ({ plannerID, majorName, majorCoreScore, matchPct }) as any;

  test('is never the planner a manual override made the primary major', () => {
    const result = detectMajors([rec('a', 'Alpha', 1, 90), rec('b', 'Beta', 0.9, 85)], config, { manualOverride: 'b' } as any);
    expect(result.primaryMajor?.plannerID).toBe('b');
    expect(result.secondMajor?.plannerID).toBe('a');
  });

  test('skips other planner versions of the primary major', () => {
    const result = detectMajors(
      [rec('a1', 'Alpha', 1, 90), rec('a2', 'Alpha', 0.95, 88), rec('b', 'Beta', 0.9, 80)], config, {} as any,
    );
    expect(result.primaryMajor?.plannerID).toBe('a1');
    expect(result.secondMajor?.plannerID).toBe('b');
  });

  test('is still held to the threshold', () => {
    const result = detectMajors([rec('a1', 'Alpha', 1, 90), rec('a2', 'Alpha', 0.95, 88), rec('b', 'Beta', 0.9, 40)], config, {} as any);
    expect(result.secondMajor).toBeNull();
  });
});
