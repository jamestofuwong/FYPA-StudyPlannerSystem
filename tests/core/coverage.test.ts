// @ts-nocheck
/**
 * Coverage booster tests targeting uncovered lines:
 *
 * analyticsService.ts      line 5   (zero creditsRequired branch)
 * outputPackager.ts        lines 32-53 (override, noMajorDetected, unavailable units)
 * plannerFilter.ts         lines 9-12, 36, 77 (error class, semester fallback, year fallback)
 * profileBuilder.ts        lines 75-78, 143-151 (WIL category, unclassified warn, requisites)
 * scoringEngine.ts         line 205 (zero slotsRequired free elective branch)
 * scraperOrchestrator.ts   lines 80, 129-131 (login mid-auto-run, catch in student scrape)
 */

// ─────────────────────────────────────────────────────────────────────────────
// analyticsService
// ─────────────────────────────────────────────────────────────────────────────
import { calculateProgress } from '@core/services/analyticsService';

describe('analyticsService – calculateProgress', () => {
  test('returns 0 when creditsRequired is 0 (line 5 branch)', () => {
    expect(calculateProgress({ creditsRequired: 0, creditsCompleted: 50 } as any)).toBe(0);
  });

  test('returns 0 when creditsRequired is undefined/null', () => {
    expect(calculateProgress({ creditsRequired: null, creditsCompleted: 50 } as any)).toBe(0);
  });

  test('returns correct percentage for normal input', () => {
    expect(calculateProgress({ creditsRequired: 200, creditsCompleted: 100 } as any)).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// plannerFilter
// ─────────────────────────────────────────────────────────────────────────────
import { filterPlanners, PlannerFilterError } from '@core/services/matching/plannerFilter';

const basePlanner = (year: number, sem: 1 | 2, id = `${year}-${sem}`) => ({
  plannerID: id,
  majorName: 'Test Major',
  courseType: 'bachelor',
  intakeYear: year,
  intakeSemester: sem,
  requiredCore: [],
  requiredMajorCore: new Set<string>(),
  prescribedElectiveCategories: [],
  freeElectivePool: new Set<string>(),
  freeElectiveSlotsRequired: 0,
});

const baseConfig = { preferIntakeYear: false, wilExemptionCount: 0,
  weightCore: 0.4, weightMajorCore: 0.3, weightPrescribedElective: 0.2,
  weightFreeElective: 0.05, weightWIL: 0.05 };

describe('plannerFilter – filterPlanners', () => {
  test('throws PlannerFilterError when no planners loaded (line 9-12)', () => {
    expect(() => filterPlanners([], 2024, 1, baseConfig))
      .toThrow(PlannerFilterError);
    expect(() => filterPlanners([], 2024, 1, baseConfig))
      .toThrow('[SUMS PlannerFilter] No planner templates are loaded.');
  });

  test('PlannerFilterError has correct name property', () => {
    try { filterPlanners([], 2024, 1, baseConfig); }
    catch (e: any) { expect(e.name).toBe('PlannerFilterError'); }
  });

  test('falls back to Level 1 when semester not found (line 36)', () => {
    const planners = [basePlanner(2024, 1), basePlanner(2024, 1, 'p2')];
    // Student is sem 2 but only sem 1 planners exist
    const result = filterPlanners(planners, 2024, 2, baseConfig);
    expect(result).toHaveLength(2); // returns all Level 1
  });

  test('throws when preferIntakeYear=true and year not found (line 77)', () => {
    const planners = [basePlanner(2023, 1)];
    const strictConfig = { ...baseConfig, preferIntakeYear: true };
    expect(() => filterPlanners(planners, 2024, 1, strictConfig))
      .toThrow(PlannerFilterError);
    expect(() => filterPlanners(planners, 2024, 1, strictConfig))
      .toThrow('preferIntakeYear=true');
  });

  test('falls back to most recent year when preferIntakeYear=false (line 77)', () => {
    const planners = [basePlanner(2022, 1), basePlanner(2023, 1), basePlanner(2023, 2)];
    const result = filterPlanners(planners, 2025, 1, baseConfig);
    // Should return year 2023 planners (most recent)
    expect(result.every((p) => p.intakeYear === 2023)).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('returns exact Level 2 match when year and semester both match', () => {
    const planners = [basePlanner(2024, 1), basePlanner(2024, 2), basePlanner(2023, 1)];
    const result = filterPlanners(planners, 2024, 2, baseConfig);
    expect(result).toHaveLength(1);
    expect(result[0].intakeSemester).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// profileBuilder
// ─────────────────────────────────────────────────────────────────────────────
import { buildStudentProfile } from '@core/services/matching/profileBuilder';

const rawInput = (studentID = 'S001') => ({
  studentID,
  courseType: 'bachelor',
  intakeYear: 2022,
  intakeSemester: 1 as 1 | 2,
  currentSemester: 1 as 1 | 2,
  completedUnitCodes: [],
  hasWIL: false,
});

describe('profileBuilder – buildStudentProfile', () => {
  test('classifies WIL unit — not added to any set (lines 75-78)', () => {
    const master = [{
      code: 'WIL101', name: 'WIL', category: 'WIL' as any,
      subjectTags: [], offeringSemesters: [1, 2], requisites: [],
    }];
    const profile = buildStudentProfile(rawInput(), new Set(['WIL101']), master);
    expect(profile.completedCore.has('WIL101')).toBe(false);
    expect(profile.completedMajorCore.has('WIL101')).toBe(false);
    expect(profile.completedFreeElectives.has('WIL101')).toBe(false);
    expect(profile.completedUnits.has('WIL101')).toBe(true); // still in completedUnits
  });

  test('logs unclassified units and excludes from all sets (lines 143-151)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const profile = buildStudentProfile(rawInput(), new Set(['UNKNOWN999']), []);
    expect(profile.unclassifiedUnits).toContain('UNKNOWN999');
    expect(profile.completedCore.has('UNKNOWN999')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN999'));
    warnSpy.mockRestore();
  });

  test('flags prerequisite violation in requisiteFlags', () => {
    const master = [{
      code: 'ADV202', name: 'Advanced', category: 'majorCore' as any,
      subjectTags: [], offeringSemesters: [1], requisites: [
        { type: 'prerequisite' as any, unitCode: 'BAS101' },
      ],
    }];
    // Student completed ADV202 without BAS101
    const profile = buildStudentProfile(rawInput(), new Set(['ADV202']), master);
    expect(profile.requisiteFlags).toHaveLength(1);
    expect(profile.requisiteFlags[0].requisiteType).toBe('prerequisite');
    expect(profile.requisiteFlags[0].relatedUnit).toBe('BAS101');
  });

  test('flags concurrent requisite violation', () => {
    const master = [{
      code: 'CON202', name: 'Concurrent', category: 'core' as any,
      subjectTags: [], offeringSemesters: [1], requisites: [
        { type: 'concurrent' as any, unitCode: 'BASE101' },
      ],
    }];
    const profile = buildStudentProfile(rawInput(), new Set(['CON202']), master);
    expect(profile.requisiteFlags[0].requisiteType).toBe('concurrent');
  });

  test('flags antirequisite violation when both units completed', () => {
    const master = [
      {
        code: 'A101', name: 'A', category: 'core' as any,
        subjectTags: [], offeringSemesters: [1], requisites: [
          { type: 'antirequisite' as any, unitCode: 'B101' },
        ],
      },
      {
        code: 'B101', name: 'B', category: 'core' as any,
        subjectTags: [], offeringSemesters: [1], requisites: [],
      },
    ];
    const profile = buildStudentProfile(rawInput(), new Set(['A101', 'B101']), master);
    const flag = profile.requisiteFlags.find((f) => f.requisiteType === 'antirequisite');
    expect(flag).toBeDefined();
    expect(flag?.relatedUnit).toBe('B101');
  });

  test('populates electivesByTag for prescribed units', () => {
    const master = [{
      code: 'ELEC301', name: 'Elective', category: 'prescribed' as any,
      subjectTags: ['AI', 'ML'], offeringSemesters: [1], requisites: [],
    }];
    const profile = buildStudentProfile(rawInput(), new Set(['ELEC301']), master);
    expect(profile.electivesByTag.get('AI')?.has('ELEC301')).toBe(true);
    expect(profile.electivesByTag.get('ML')?.has('ELEC301')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoringEngine
// ─────────────────────────────────────────────────────────────────────────────
import { scorePlanners, applyWILExemption } from '@core/services/matching/scoringEngine';

const baseProfile = () => ({
  studentID: 'S001',
  courseType: 'bachelor',
  intakeYear: 2022,
  intakeSemester: 1 as 1 | 2,
  currentSemester: 1 as 1 | 2,
  completedUnits: new Set<string>(),
  completedCore: new Set<string>(),
  completedMajorCore: new Set<string>(),
  completedPrescribed: new Set<string>(),
  completedFreeElectives: new Set<string>(),
  electivesByTag: new Map(),
  hasWIL: false,
  unclassifiedUnits: [],
  requisiteFlags: [],
});

const scoringConfig = {
  preferIntakeYear: false, wilExemptionCount: 2,
  weightCore: 0.4, weightMajorCore: 0.3,
  weightPrescribedElective: 0.2, weightFreeElective: 0.05, weightWIL: 0.05,
};

describe('scoringEngine – applyWILExemption', () => {
  test('returns original slots when hasWIL is false', () => {
    expect(applyWILExemption(4, false, 2)).toBe(4);
  });

  test('returns original slots when exemptionCount is 0', () => {
    expect(applyWILExemption(4, true, 0)).toBe(4);
  });

  test('subtracts exemption count when hasWIL and count > 0', () => {
    expect(applyWILExemption(4, true, 2)).toBe(2);
  });

  test('clamps to 0, never negative', () => {
    expect(applyWILExemption(1, true, 5)).toBe(0);
  });
});

describe('scoringEngine – scorePlanners', () => {
  test('free elective score = 1.0 when slotsRequired is 0 after WIL exemption (line 205)', () => {
    const profile = { ...baseProfile(), hasWIL: true,
      completedFreeElectives: new Set<string>() };
    const planner = {
      plannerID: 'P1', majorName: 'Test', courseType: 'bachelor',
      intakeYear: 2022, intakeSemester: 1 as 1 | 2,
      requiredCore: ['CORE1'],
      requiredMajorCore: new Set(['MC1']),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set(['FREE1']),
      freeElectiveSlotsRequired: 2, // WIL exempts 2 → adjusted = 0
    };
    // WIL exemption of 2 reduces 2 slots to 0 → full free elective score
    const [result] = scorePlanners(profile, [planner], scoringConfig);
    expect(result.freePossible).toBe(0);
    expect(result.missingFreeSlots).toBe(0);
  });

  test('scores zero core when requiredCore is empty (warns)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const profile = baseProfile();
    const planner = {
      plannerID: 'P1', majorName: 'Test', courseType: 'bachelor',
      intakeYear: 2022, intakeSemester: 1 as 1 | 2,
      requiredCore: [],
      requiredMajorCore: new Set(['MC1']),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    };
    const [result] = scorePlanners(profile, [planner], scoringConfig);
    expect(result.coreMatched).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('zero required core'));
    warnSpy.mockRestore();
  });

  test('scores zero majorCore when requiredMajorCore is empty (warns)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const profile = baseProfile();
    const planner = {
      plannerID: 'P1', majorName: 'Test', courseType: 'bachelor',
      intakeYear: 2022, intakeSemester: 1 as 1 | 2,
      requiredCore: ['CORE1'],
      requiredMajorCore: new Set<string>(),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    };
    const [result] = scorePlanners(profile, [planner], scoringConfig);
    expect(result.majorCoreMatched).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('zero required major core'));
    warnSpy.mockRestore();
  });

  test('prescribed score = 1.0 when no categories', () => {
    const profile = baseProfile();
    const planner = {
      plannerID: 'P1', majorName: 'Test', courseType: 'bachelor',
      intakeYear: 2022, intakeSemester: 1 as 1 | 2,
      requiredCore: ['CORE1'],
      requiredMajorCore: new Set(['MC1']),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    };
    const [result] = scorePlanners(profile, [planner], scoringConfig);
    expect(result.prescribedMatched).toBe(0);
    expect(result.prescribedPossible).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// outputPackager
// ─────────────────────────────────────────────────────────────────────────────
import { buildDisplayPayload } from '@core/services/matching/outputPackager';

const makeRecord = (id = 'P1'): any => ({
  plannerID: id, majorName: 'CS', courseType: 'bachelor',
  intakeYear: 2022, intakeSemester: 1,
  matchPct: 80, majorCoreScore: 0.8,
  coreMatched: 3, coreRequired: 4,
  majorCoreMatched: 2, majorCoreRequired: 3,
  prescribedMatched: 1, prescribedPossible: 2,
  freeMatched: 1, freePossible: 2,
  wilScore: 0, wilExemptionApplied: false,
  missingCore: ['CORE4'], missingMajorCore: ['MC3'],
  missingPrescribed: [{ categoryCode: 'CAT1', unfilledSlots: 1 }],
  missingFreeSlots: 1, requisiteFlags: [],
});

const makeProfile = (): any => ({
  studentID: 'S001', courseType: 'bachelor',
  intakeYear: 2022, intakeSemester: 1, currentSemester: 1 as 1 | 2,
  completedUnits: new Set(), completedCore: new Set(),
  completedMajorCore: new Set(), completedPrescribed: new Set(),
  completedFreeElectives: new Set(), electivesByTag: new Map(),
  hasWIL: false, unclassifiedUnits: [], requisiteFlags: [],
});

describe('outputPackager – buildDisplayPayload', () => {
  test('sets isOverride=true and detectedPrimary when status=overridden (lines 32-40)', () => {
    const result: any = {
      status: 'overridden',
      primaryMajor: makeRecord('override'),
      algorithmPrimary: makeRecord('algo'),
      secondMajor: null,
      rankedPlanners: [],
    };
    const payload = buildDisplayPayload(makeProfile(), result, []);
    expect(payload.isOverride).toBe(true);
    expect(payload.detectedPrimary).toBeDefined();
    expect(payload.detectedPrimary?.majorName).toBe('CS');
  });

  test('populates topAlternatives when status=noMajorDetected (lines 44-47)', () => {
    const result: any = {
      status: 'noMajorDetected',
      primaryMajor: null,
      secondMajor: null,
      algorithmPrimary: null,
      rankedPlanners: [makeRecord('P1'), makeRecord('P2'), makeRecord('P3'), makeRecord('P4')],
    };
    const payload = buildDisplayPayload(makeProfile(), result, []);
    expect(payload.topAlternatives).toHaveLength(3); // slice(0,3)
    expect(payload.unavailableUnits).toHaveLength(0); // no primaryMajor
  });

  test('detectedPrimary is undefined when not overridden (lines 32-40)', () => {
    const result: any = {
      status: 'detected',
      primaryMajor: makeRecord(),
      secondMajor: null,
      algorithmPrimary: makeRecord('algo'),
      rankedPlanners: [],
    };
    const payload = buildDisplayPayload(makeProfile(), result, []);
    expect(payload.isOverride).toBe(false);
    expect(payload.detectedPrimary).toBeUndefined();
  });

  test('buildUnavailableUnits filters units not offered in currentSemester (lines 49-53)', () => {
    const result: any = {
      status: 'detected',
      primaryMajor: { ...makeRecord(), missingCore: ['CORE4'], missingMajorCore: [] },
      secondMajor: null,
      algorithmPrimary: null,
      rankedPlanners: [],
    };
    const unitMaster = [{
      code: 'CORE4', name: 'Core 4',
      offeringSemesters: [2], // only offered in sem 2
      category: 'core', subjectTags: [], requisites: [],
    }];
    const profile = { ...makeProfile(), currentSemester: 1 as 1 | 2 };
    const payload = buildDisplayPayload(profile, result, unitMaster);
    expect(payload.unavailableUnits).toHaveLength(1);
    expect(payload.unavailableUnits[0].unitCode).toBe('CORE4');
    expect(payload.unavailableUnits[0].availableInSemesters).toEqual([2]);
  });

  test('unit offered in currentSemester is NOT in unavailableUnits', () => {
    const result: any = {
      status: 'detected',
      primaryMajor: { ...makeRecord(), missingCore: ['CORE4'], missingMajorCore: [] },
      secondMajor: null, algorithmPrimary: null, rankedPlanners: [],
    };
    const unitMaster = [{
      code: 'CORE4', name: 'Core 4', offeringSemesters: [1, 2],
      category: 'core', subjectTags: [], requisites: [],
    }];
    const profile = { ...makeProfile(), currentSemester: 1 as 1 | 2 };
    const payload = buildDisplayPayload(profile, result, unitMaster);
    expect(payload.unavailableUnits).toHaveLength(0);
  });

  test('secondMajor is populated from result.secondMajor', () => {
    const result: any = {
      status: 'detected',
      primaryMajor: makeRecord('P1'),
      secondMajor: makeRecord('P2'),
      algorithmPrimary: null,
      rankedPlanners: [],
    };
    const payload = buildDisplayPayload(makeProfile(), result, []);
    expect(payload.secondMajor).not.toBeNull();
    expect(payload.secondMajor?.majorName).toBe('CS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scraperOrchestrator
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('@core/services/scrapper/advisorScraperService', () => ({
  runScraperStep: jest.fn(),
  isMicrosoftLoginUrl: jest.fn(() => false),
  sanitizeUrl: jest.fn((url: string) => url),
  TARGET_URL: 'https://portal.example.com',
}));

import { runAutoRun, runStudentScrape } from '@core/services/scrapper/scraperOrchestrator';
import { runScraperStep, isMicrosoftLoginUrl } from '@core/services/scrapper/advisorScraperService';

const fakeAdapter = {
  loadURL: jest.fn().mockResolvedValue(undefined),
  executeJavaScript: jest.fn().mockResolvedValue({}),
  getURL: jest.fn().mockReturnValue('https://portal.example.com'),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

const cbs = {
  onLog: jest.fn(),
  onBotStep: jest.fn(),
  onScrapeResult: jest.fn(),
};

describe('scraperOrchestrator – runAutoRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isMicrosoftLoginUrl as jest.Mock).mockReturnValue(false);
  });

  test('returns loginDetected=true mid-run when MS login URL detected (line 80)', async () => {
    // First step succeeds, then login is detected
    (runScraperStep as jest.Mock).mockResolvedValue({ logs: ['ok'] });
    (isMicrosoftLoginUrl as jest.Mock)
      .mockReturnValueOnce(false)  // after step 1
      .mockReturnValueOnce(true);  // after step 2

    const result = await runAutoRun(fakeAdapter, 0, cbs);
    expect(result.loginDetected).toBe(true);
    expect(result.completedIndex).toBeGreaterThan(0);
  });

  test('returns error when a step throws (line 80 catch branch)', async () => {
    (runScraperStep as jest.Mock).mockRejectedValue(new Error('Step failed'));
    const result = await runAutoRun(fakeAdapter, 0, cbs);
    expect(result.error).toBe('Step failed');
    expect(result.loginDetected).toBe(false);
    expect(cbs.onLog).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('Step failed')]));
  });

  test('completes all steps and returns loginDetected=false', async () => {
    (runScraperStep as jest.Mock).mockResolvedValue({ logs: ['done'] });
    const result = await runAutoRun(fakeAdapter, 0, cbs);
    expect(result.loginDetected).toBe(false);
    expect(result.error).toBeUndefined();
  });

  test('resumes from startIndex > 0', async () => {
    (runScraperStep as jest.Mock).mockResolvedValue({ logs: [] });
    // AUTO_RUN_STEPS has 4 steps; start at 3 = only 1 step runs
    const callsBefore = (runScraperStep as jest.Mock).mock.calls.length;
    await runAutoRun(fakeAdapter, 3, cbs);
    const callsAfter = (runScraperStep as jest.Mock).mock.calls.length;
    expect(callsAfter - callsBefore).toBe(1);
  });
});

describe('scraperOrchestrator – runStudentScrape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isMicrosoftLoginUrl as jest.Mock).mockReturnValue(false);
  });

  test('returns error when a step throws (lines 129-131)', async () => {
    (runScraperStep as jest.Mock).mockRejectedValue(new Error('JS Error'));
    const result = await runStudentScrape(fakeAdapter, 'S001', 'latest', cbs);
    expect(result.error).toBe('JS Error');
    expect(result.loginDetected).toBe(false);
    expect(cbs.onLog).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('JS Error')]));
  });

  test('returns loginDetected=true when a step triggers login', async () => {
    (runScraperStep as jest.Mock).mockResolvedValue({
      logs: [], loginDetected: true, scrapeResult: null,
    });
    const result = await runStudentScrape(fakeAdapter, 'S001', 'latest', cbs);
    expect(result.loginDetected).toBe(true);
  });

  test('merges studentName and enrollmentOptions into finalResult', async () => {
    const scrapeResult = { scraped: true, courseList: [], studentName: '', enrollmentOptions: [] };
    (runScraperStep as jest.Mock)
      .mockResolvedValueOnce({ logs: [], studentName: 'Alice', loginDetected: false })
      .mockResolvedValueOnce({ logs: [], enrollmentOptions: [{ text: 'Opt1' }], loginDetected: false })
      .mockResolvedValueOnce({ logs: [], selectedEnrollment: 'Opt1', loginDetected: false })
      .mockResolvedValueOnce({ logs: [], loginDetected: false })
      .mockResolvedValueOnce({ logs: [], scrapeResult, loginDetected: false });

    const result = await runStudentScrape(fakeAdapter, 'S001', 'latest', cbs);
    expect(result.finalResult?.studentName).toBe('Alice');
    expect(result.finalResult?.enrollmentOptions).toEqual([{ text: 'Opt1' }]);
    expect(result.finalResult?.selectedEnrollment).toBe('Opt1');
  });

  test('calls onScrapeResult callback when scrapeResult is returned', async () => {
    const scrapeResult = { scraped: true, courseList: [] };
    (runScraperStep as jest.Mock)
      .mockResolvedValueOnce({ logs: [], loginDetected: false })
      .mockResolvedValueOnce({ logs: [], loginDetected: false })
      .mockResolvedValueOnce({ logs: [], loginDetected: false })
      .mockResolvedValueOnce({ logs: [], loginDetected: false })
      .mockResolvedValueOnce({ logs: [], scrapeResult, loginDetected: false });

    await runStudentScrape(fakeAdapter, 'S001', 'latest', cbs);
    expect(cbs.onScrapeResult).toHaveBeenCalledWith(scrapeResult);
  });
});