// @ts-nocheck

import {
  DEFAULT_CONFIG,
  AlgorithmConfig,
  PlannerTemplate,
  PlannerScoreRecord,
  StudentProfile,
  RawStudentInput,
} from "../../../core/shared/types/matching";

import { scorePlanners, applyWILExemption } from "../../../core/services/matching/scoringEngine";
import { detectMajors, mergeSort } from "../../../core/services/matching/majorDetector";
import { buildDisplayPayload } from "../../../core/services/matching/outputPackager";

// --- Team Helper Functions 
function makePlanner(overrides: Partial<PlannerTemplate>): PlannerTemplate {
  return {
    plannerID: "BA-CS",
    majorName: "Data Science",
    courseType: "degree",
    durationSemesters: 6,
    intakeYear: 2024,
    intakeSemester: 1,
    requiredCore: ["COS10009", "COS10026"],
    requiredMajorCore: new Set(["COS10022", "COS20031"]),
    prescribedElectiveCategories: [],
    freeElectivePool: new Set(),
    freeElectiveSlotsRequired: 0,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    studentID: "102785914",
    courseType: "degree",
    intakeYear: 2024,
    intakeSemester: 1,
    currentSemester: 1,
    completedUnits: new Set(),
    completedCore: new Set(),
    completedMajorCore: new Set(),
    completedPrescribed: new Set(),
    completedFreeElectives: new Set(),
    electivesByTag: new Map(),
    hasWIL: false,
    unclassifiedUnits: [],
    requisiteFlags: [],
    ...overrides,
  };
}

function makeRawStudent(overrides: Partial<RawStudentInput> = {}): RawStudentInput {
  return {
    studentID: "102785914",
    courseType: "degree",
    intakeYear: 2024,
    intakeSemester: 1,
    currentSemester: 1,
    completedUnitCodes: [],
    hasWIL: false,
    ...overrides,
  };
}

function makeScoreRecord(overrides: Partial<PlannerScoreRecord> = {}): PlannerScoreRecord {
  return {
    plannerID: "BA-CS",
    majorName: "Data Science",
    courseType: "degree",
    intakeYear: 2024,
    intakeSemester: 1,
    matchPct: 50,
    majorCoreScore: 0.5,
    coreMatched: 1,
    coreRequired: 2,
    majorCoreMatched: 1,
    majorCoreRequired: 2,
    prescribedMatched: 0,
    prescribedPossible: 0,
    freeMatched: 0,
    freePossible: 0,
    wilScore: 0,
    wilExemptionApplied: false,
    missingCore: [],
    missingMajorCore: [],
    missingPrescribed: [],
    missingFreeSlots: 0,
    requisiteFlags: [],
    ...overrides,
  };
}

// --- Main Test Suite --------------------------------------------------

describe("Matching Engine Phase 2 & 3 (Jest)", () => {
  
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // --- MM-05: applyWILExemption --------------------------------

  describe("MM-05 - applyWILExemption", () => {
    test("returns unchanged slot count when hasWIL is false", () => {
      expect(applyWILExemption(4, false, 2)).toBe(4);
    });
    test("reduces free elective slots by wilExemptionCount when hasWIL is true", () => {
      expect(applyWILExemption(4, true, 2)).toBe(2);
    });
  });

  // --- MM-05: scorePlanners --------------------------------

  describe("MM-05 - scorePlanners", () => {
    
    test("ULTIMATE 100% TEST: should hit 100% for full completion", () => {
      // Setup a planner with all categories
      const fullPlanner = makePlanner({
        plannerID: "GOLDEN_PLAN",
        requiredCore: ["C1"],
        requiredMajorCore: new Set(["M1"]),
        prescribedElectiveCategories: [
          { categoryCode: "GRP_A", pool: new Set(["UNIT_A"]), slots: 1 }
        ],
        freeElectivePool: new Set(["UNIT_FREE"]),
        freeElectiveSlotsRequired: 3, // Requires 3 - 2 (WIL) = 1 actual slot
      });

      // Provide a student who has matched every string exactly
      const fullProfile = makeProfile({
        completedCore: new Set(["C1"]),
        completedMajorCore: new Set(["M1"]),
        completedPrescribed: new Set(["UNIT_A"]), // Matches GRP_A pool
        completedFreeElectives: new Set(["UNIT_FREE"]), // Matches 1 required slot
        hasWIL: true, // Adds final 5%
      });

      const results = scorePlanners(fullProfile, [fullPlanner], DEFAULT_CONFIG);
      
      // Math check: 40% (Core) + 30% (Major) + 20% (Prescribed) + 5% (Free) + 5% (WIL) = 100
      expect(results[0].matchPct).toBe(100);
    });

    test("BUG CHECK: should return 100% match when student needs ZERO electives after exemption", () => {
      const edgePlanner = makePlanner({
        requiredCore: ["C1"],
        requiredMajorCore: new Set(["MC1"]),
        freeElectiveSlotsRequired: 2, // WIL will waive all 2 slots
      });

      const edgeProfile = makeProfile({
        completedCore: new Set(["C1"]),
        completedMajorCore: new Set(["MC1"]),
        hasWIL: true, // Gives 2 exemptions, so 2 - 2 = 0 slots required
      });

      const [result] = scorePlanners(edgeProfile, [edgePlanner], DEFAULT_CONFIG);
      expect(result.matchPct).toBe(100);
    });
  });

  // --- MM-07: Sorting & Detection (Original teammate tests) --------------------------------

  describe("MM-07 - Logic Flow", () => {
    test("mergeSort sorts descending by majorCoreScore", () => {
      const records = [
        makeScoreRecord({ plannerID: "A", majorCoreScore: 0.3 }),
        makeScoreRecord({ plannerID: "B", majorCoreScore: 0.8 }),
      ];
      const sorted = mergeSort(records);
      expect(sorted[0].plannerID).toBe("B");
    });

    test("detectMajors assigns rank-1 as primary major", () => {
      const records = [makeScoreRecord({ plannerID: "DS", majorCoreScore: 0.9, matchPct: 80 })];
      const result = detectMajors(records, DEFAULT_CONFIG, makeRawStudent());
      expect(result.primaryMajor?.plannerID).toBe("DS");
      expect(result.status).toBe("detected");
    });
  });

  // --- MM-08: Output Packaging  --------------------------------

  describe("MM-08 - buildDisplayPayload", () => {
    test("payload contains correct studentID", () => {
      const record = makeScoreRecord();
      const result = { primaryMajor: record, secondMajor: null, status: "detected" as const, rankedPlanners: [record] };
      const payload = buildDisplayPayload(makeProfile({ studentID: "102785914" }), result, []);
      expect(payload.studentID).toBe("102785914");
    });

    test("Packager - Status Detected (Line 89)", () => {
      const primary = makeScoreRecord({ matchPct: 90 });
      const detection = { 
        primaryMajor: primary, 
        secondMajor: null, 
        status: "detected" as const, 
        rankedPlanners: [primary] 
      };
      const payload = buildDisplayPayload(makeProfile({ studentID: "123" }), detection, []);
      
      // This triggers the branch where topAlternatives returns empty
      expect(payload.topAlternatives).toHaveLength(0);
    });
  });

  test("Zero-Requirement Safety Coverage (Lines 77, 195, 211, 233)", () => {
    // 1. Create a planner where every category is empty/zero
    const hollowPlanner = makePlanner({
      requiredCore: [],               // Triggers Line 163-164 (approx)
      requiredMajorCore: new Set([]), // Triggers Line 176-177 (approx)
      prescribedElectiveCategories: [], // Triggers Line 186/206 (approx)
      freeElectiveSlotsRequired: 0,   // Triggers Line 233 (approx)
    });

    const student = makeProfile();
    
    // 2. This execution hits the 'if (len === 0)' branches
    const results = scorePlanners(student, [hollowPlanner], DEFAULT_CONFIG);

    // Empty core/majorCore score 0 (not 1.0) by design; prescribed+free with 0 slots score 1.0
    // 0×0.40 + 0×0.30 + 1.0×0.20 + 1.0×0.05 + 0×0.05 = 0.25
    expect(results[0].matchPct).toBe(25);
  });

  test("Detector Edge Cases - No Major and Empty List (Line 62+)", () => {
    const student = makeRawStudent();
    
    // 1. Test completely empty results (Line 108)
    const resultEmpty = detectMajors([], DEFAULT_CONFIG, student);
    expect(resultEmpty.status).toBe("noMajorDetected");

    // 2. Test low score (below 30% threshold)
    const lowScore = [makeScoreRecord({ matchPct: 10, majorCoreScore: 0.1 })];
    const resultLow = detectMajors(lowScore, DEFAULT_CONFIG, student);
    expect(resultLow.status).toBe("noMajorDetected");
  });

  test("Coverage Booster: Zero Requirements (Lines 77, 195, 211, 233)", () => {
    const hollowPlanner = makePlanner({
      requiredCore: [],               // Triggers Line 77
      prescribedElectiveCategories: [], // Triggers Line 195/211
      freeElectiveSlotsRequired: 0,   // Triggers Line 233
    });
    
    const results = scorePlanners(makeProfile(), [hollowPlanner], DEFAULT_CONFIG);
    expect(results[0].matchPct).toBe(25);
  });
});