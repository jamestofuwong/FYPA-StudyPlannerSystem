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

  // scorePlanners reads completedUnits and lets each planner's own lists decide what a unit satisfies, so
  // that is the field a fixture has to populate. The per-category sets on StudentProfile are built from one
  // global category across every planner and are deliberately not consulted, see profileBuilder.ts.
  test('ignores completed units that do not belong to the planner', () => {
    const profile = {
      hasWIL: false,
      completedUnits: new Set(['UNKNOWN']),
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
      completedUnits: new Set(['CORE1', 'MAJOR1', 'PRE1', 'FREE1', 'FREE2']),
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
  // ====== A unit's category belongs to the planner, not to the unit ==========================
  //
  // unitMasterTableBuilder.ts resolves ONE category per unit across all 45 planners, highest priority
  // winning (major_core > prescribed_elective > core). profileBuilder.ts then files the student's units into
  // completedCore/completedMajorCore/... using that single global answer. Nine of the 65 units in the loaded
  // planners sit in more than one category, COS20007 being core in five planners and major_core in five
  // others, so for half of them the global answer is the wrong one and scoring against those sets
  // undercounted the student. These tests pin the behaviour that replaced it.

  test('a unit that is core here but major core elsewhere still counts as core here', () => {
    // Exactly the production state that was wrong: the student passed COS20007, the global category filed it
    // under major core, and this planner wants it as core.
    const profile = {
      hasWIL: false,
      completedUnits: new Set(['COS20007']),
      completedCore: new Set<string>(),
      completedMajorCore: new Set(['COS20007']),
      completedPrescribed: new Set<string>(),
      completedFreeElectives: new Set<string>(),
    } as StudentProfile;

    const planner = {
      plannerID: 'iot',
      requiredCore: ['COS20007'],
      requiredMajorCore: new Set<string>(),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    } as unknown as PlannerTemplate;

    const [result] = scorePlanners(profile, [planner], DEFAULT_CONFIG);

    expect(result.coreMatched).toBe(1);
    expect(result.missingCore).toEqual([]);
  });

  test('the same unit counts as major core in a planner that requires it as major core', () => {
    const profile = {
      hasWIL: false,
      completedUnits: new Set(['COS20007']),
      completedCore: new Set(['COS20007']),          // the opposite mis-filing, equally ignored
      completedMajorCore: new Set<string>(),
      completedPrescribed: new Set<string>(),
      completedFreeElectives: new Set<string>(),
    } as StudentProfile;

    const planner = {
      plannerID: 'swe',
      requiredCore: [],
      requiredMajorCore: new Set(['COS20007']),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    } as unknown as PlannerTemplate;

    const [result] = scorePlanners(profile, [planner], DEFAULT_CONFIG);

    expect(result.majorCoreMatched).toBe(1);
    expect(result.missingMajorCore).toEqual([]);
  });

  // class estimation reads missingCore to decide what to enrol a student in next semester, so a passed unit
  // appearing there became a recommendation to sit a unit again.
  test('a passed unit never appears in the missing lists', () => {
    const profile = {
      hasWIL: false,
      completedUnits: new Set(['COS20007', 'COS10003']),
      completedCore: new Set<string>(),
      completedMajorCore: new Set(['COS20007']),
      completedPrescribed: new Set(['COS10003']),
      completedFreeElectives: new Set<string>(),
    } as StudentProfile;

    const planner = {
      plannerID: 'iot',
      requiredCore: ['COS20007', 'COS10003', 'TNE10006'],
      requiredMajorCore: new Set(['COS30049']),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set<string>(),
      freeElectiveSlotsRequired: 0,
    } as unknown as PlannerTemplate;

    const [result] = scorePlanners(profile, [planner], DEFAULT_CONFIG);

    expect(result.missingCore).toEqual(['TNE10006']);
    expect(result.missingMajorCore).toEqual(['COS30049']);
  });

  // Scoring now works from one flat completed set, so a unit sitting in two of a planner's buckets could be
  // counted twice and push the total above what the student has actually done. None of the 45 loaded planners
  // has that overlap, but planners are imported, so the precedence is enforced rather than assumed.
  test('a unit filling a core slot does not also fill an elective slot', () => {
    const profile = {
      hasWIL: false,
      completedUnits: new Set(['COS20007']),
      completedCore: new Set<string>(),
      completedMajorCore: new Set<string>(),
      completedPrescribed: new Set<string>(),
      completedFreeElectives: new Set<string>(),
    } as StudentProfile;

    const planner = {
      plannerID: 'overlap',
      requiredCore: ['COS20007'],
      requiredMajorCore: new Set<string>(),
      prescribedElectiveCategories: [{ categoryCode: 'E1', pool: new Set(['COS20007']), slots: 1 }],
      freeElectivePool: new Set(['COS20007']),
      freeElectiveSlotsRequired: 1,
    } as unknown as PlannerTemplate;

    const [result] = scorePlanners(profile, [planner], DEFAULT_CONFIG);

    expect(result.coreMatched).toBe(1);
    expect(result.prescribedMatched).toBe(0);
    expect(result.freeMatched).toBe(0);
  });
});
