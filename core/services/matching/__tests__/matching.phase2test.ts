// ============================================================
// matching-phase2.test.ts
// Unit tests for MM-05 through MM-08
// Uses Node.js built-in test runner.
//
// Run with:
//   npx tsx --test core/services/matching/__tests__/matching.phase2test.ts
// ============================================================

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CONFIG,
  AlgorithmConfig,
  PlannerTemplate,
  PlannerScoreRecord,
  StudentProfile,
  RawStudentInput,
} from "../../../shared/types/matching";

import { scorePlanners, applyWILExemption } from "../scoringEngine";
import { detectMajors, mergeSort } from "../majorDetector";
import { buildDisplayPayload } from "../outputPackager";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlanner(overrides: Partial<PlannerTemplate>): PlannerTemplate {
  return {
    plannerID: "BA-CS",
    majorName: "Data Science",
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
    intakeYear: 2024,
    intakeSemester: 1,
    completedUnits: new Set(),
    completedCore: new Set(),
    completedMajorCore: new Set(),
    completedPrescribed: new Set(),
    completedFreeElectives: new Set(),
    electivesByTag: new Map(),
    hasWIL: false,
    unclassifiedUnits: [],
    ...overrides,
  };
}

function makeRawStudent(overrides: Partial<RawStudentInput> = {}): RawStudentInput {
  return {
    studentID: "102785914",
    intakeYear: 2024,
    intakeSemester: 1,
    completedUnitCodes: [],
    hasWIL: false,
    ...overrides,
  };
}

function makeScoreRecord(overrides: Partial<PlannerScoreRecord> = {}): PlannerScoreRecord {
  return {
    plannerID: "BA-CS",
    majorName: "Data Science",
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
    ...overrides,
  };
}

// ─── MM-05: applyWILExemption ─────────────────────────────────────────────────

describe("MM-05 - applyWILExemption", () => {
  test("returns unchanged slot count when hasWIL is false", () => {
    assert.equal(applyWILExemption(4, false, 2), 4);
  });

  test("reduces free elective slots by wilExemptionCount when hasWIL is true", () => {
    assert.equal(applyWILExemption(4, true, 2), 2);
  });

  test("returns unchanged slot count when wilExemptionCount is 0", () => {
    assert.equal(applyWILExemption(4, true, 0), 4);
  });

  test("does not go below 0 when exemption count exceeds slots required", () => {
    assert.equal(applyWILExemption(1, true, 5), 0);
  });

  test("exemption of exactly all slots returns 0", () => {
    assert.equal(applyWILExemption(2, true, 2), 0);
  });

  test("does not affect core or major core units", () => {
    // WIL exemption only touches free elective slots.
    // Verify core scoring is unchanged by checking a full score record.
    const planner = makePlanner({
      requiredCore: ["COS10009", "COS10026"],
      freeElectiveSlotsRequired: 4,
      freeElectivePool: new Set(["FE1", "FE2", "FE3", "FE4"]),
    });
    const wilProfile = makeProfile({
      completedCore: new Set(["COS10009", "COS10026"]),
      hasWIL: true,
    });
    const noWILProfile = makeProfile({
      completedCore: new Set(["COS10009", "COS10026"]),
      hasWIL: false,
    });
    const [wilResult] = scorePlanners(wilProfile, [planner], DEFAULT_CONFIG);
    const [noWILResult] = scorePlanners(noWILProfile, [planner], DEFAULT_CONFIG);

    // Core matched and required should be identical regardless of WIL
    assert.equal(wilResult.coreMatched, noWILResult.coreMatched);
    assert.equal(wilResult.coreRequired, noWILResult.coreRequired);
  });
});

// ─── MM-05: scorePlanners ─────────────────────────────────────────────────────

describe("MM-05 - scorePlanners", () => {
  const planner = makePlanner({
    plannerID: "DS",
    majorName: "Data Science",
    requiredCore: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"],
    requiredMajorCore: new Set(["MC1", "MC2", "MC3", "MC4", "MC5", "MC6", "MC7", "MC8"]),
    prescribedElectiveCategories: [
      { categoryCode: "PE", pool: new Set(["PE1", "PE2", "PE3", "PE4", "PE5"]), slots: 4 },
    ],
    freeElectivePool: new Set(["FE1", "FE2", "FE3", "FE4"]),
    freeElectiveSlotsRequired: 4,
  });

  test("scores zero when student has completed nothing", () => {
    const results = scorePlanners(makeProfile(), [planner], DEFAULT_CONFIG);
    assert.equal(results[0].matchPct, 0);
    assert.equal(results[0].majorCoreScore, 0);
  });

  test("matchPct is 100 when student has completed everything including WIL", () => {
    const fullProfile = makeProfile({
      completedCore:          new Set(["C1","C2","C3","C4","C5","C6","C7","C8"]),
      completedMajorCore:     new Set(["MC1","MC2","MC3","MC4","MC5","MC6","MC7","MC8"]),
      completedPrescribed:    new Set(["PE1","PE2","PE3","PE4"]),
      completedFreeElectives: new Set(["FE1","FE2","FE3","FE4"]),
      hasWIL: true,
    });
    const results = scorePlanners(fullProfile, [planner], DEFAULT_CONFIG);
    assert.equal(results[0].matchPct, 100);
  });

  test("WIL exemption reduces freePossible denominator by wilExemptionCount", () => {
    const wilProfile = makeProfile({ hasWIL: true });
    const results = scorePlanners(wilProfile, [planner], DEFAULT_CONFIG);
    // freeElectiveSlotsRequired=4, wilExemptionCount=2 → freePossible should be 2
    assert.equal(results[0].freePossible, 2);
  });

  test("WIL exemption does not change coreRequired", () => {
    const wilProfile = makeProfile({ hasWIL: true });
    const noWILProfile = makeProfile({ hasWIL: false });
    const [wil] = scorePlanners(wilProfile, [planner], DEFAULT_CONFIG);
    const [noWIL] = scorePlanners(noWILProfile, [planner], DEFAULT_CONFIG);
    assert.equal(wil.coreRequired, noWIL.coreRequired);
  });

  test("WIL score is 1 when hasWIL is true", () => {
    const results = scorePlanners(makeProfile({ hasWIL: true }), [planner], DEFAULT_CONFIG);
    assert.equal(results[0].wilScore, 1);
  });

  test("WIL score is 0 when hasWIL is false", () => {
    const results = scorePlanners(makeProfile(), [planner], DEFAULT_CONFIG);
    assert.equal(results[0].wilScore, 0);
  });

  test("prescribed elective over-completion is capped at slot count", () => {
    const overProfile = makeProfile({
      completedPrescribed: new Set(["PE1", "PE2", "PE3", "PE4", "PE5"]),
    });
    const results = scorePlanners(overProfile, [planner], DEFAULT_CONFIG);
    assert.equal(results[0].prescribedMatched, 4);
  });

  test("DS ranks higher than AI on majorCoreScore", () => {
    const aiPlanner = makePlanner({
      plannerID: "AI",
      majorName: "Artificial Intelligence",
      requiredCore: ["C1","C2","C3","C4","C5","C6","C7","C8"],
      requiredMajorCore: new Set(["AMC1","AMC2","AMC3","AMC4","AMC5","AMC6","AMC7","AMC8"]),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set(["FE1","FE2","FE3","FE4"]),
      freeElectiveSlotsRequired: 4,
    });
    const profile = makeProfile({
      completedMajorCore: new Set(["MC1","MC2","MC3","MC4","MC5","MC6","AMC1","AMC2","AMC3"]),
    });
    const results = scorePlanners(profile, [planner, aiPlanner], DEFAULT_CONFIG);
    const ds = results.find((r) => r.plannerID === "DS")!;
    const ai = results.find((r) => r.plannerID === "AI")!;
    assert.ok(ds.majorCoreScore > ai.majorCoreScore);
  });

  test("missingCore lists units not yet completed", () => {
    const profile = makeProfile({ completedCore: new Set(["COS10009"]) });
    const p = makePlanner({ requiredCore: ["COS10009", "COS10026"] });
    const [result] = scorePlanners(profile, [p], DEFAULT_CONFIG);
    assert.deepEqual(result.missingCore, ["COS10026"]);
  });

  test("missingMajorCore lists major core units not yet completed", () => {
    const profile = makeProfile({ completedMajorCore: new Set(["COS10022"]) });
    const p = makePlanner({ requiredMajorCore: new Set(["COS10022", "COS20031"]) });
    const [result] = scorePlanners(profile, [p], DEFAULT_CONFIG);
    assert.ok(result.missingMajorCore.includes("COS20031"));
    assert.ok(!result.missingMajorCore.includes("COS10022"));
  });

  test("missingFreeSlots uses WIL-adjusted denominator", () => {
    // 4 slots required, WIL exempts 2 → adjusted = 2, student completed 1 → missing = 1
    const profile = makeProfile({
      completedFreeElectives: new Set(["FE1"]),
      hasWIL: true,
    });
    const p = makePlanner({
      freeElectivePool: new Set(["FE1", "FE2", "FE3", "FE4"]),
      freeElectiveSlotsRequired: 4,
    });
    const [result] = scorePlanners(profile, [p], DEFAULT_CONFIG);
    assert.equal(result.missingFreeSlots, 1); // 2 adjusted - 1 matched = 1
  });
});

// ─── MM-07: mergeSort ─────────────────────────────────────────────────────────

describe("MM-07 - mergeSort", () => {
  test("sorts descending by majorCoreScore", () => {
    const records = [
      makeScoreRecord({ plannerID: "A", majorCoreScore: 0.3, matchPct: 40 }),
      makeScoreRecord({ plannerID: "B", majorCoreScore: 0.8, matchPct: 70 }),
      makeScoreRecord({ plannerID: "C", majorCoreScore: 0.5, matchPct: 55 }),
    ];
    const sorted = mergeSort(records);
    assert.equal(sorted[0].plannerID, "B");
    assert.equal(sorted[1].plannerID, "C");
    assert.equal(sorted[2].plannerID, "A");
  });

  test("uses matchPct as tiebreaker when majorCoreScore is equal", () => {
    const records = [
      makeScoreRecord({ plannerID: "A", majorCoreScore: 0.5, matchPct: 55 }),
      makeScoreRecord({ plannerID: "B", majorCoreScore: 0.5, matchPct: 70 }),
    ];
    const sorted = mergeSort(records);
    assert.equal(sorted[0].plannerID, "B");
    assert.equal(sorted[1].plannerID, "A");
  });

  test("handles single record", () => {
    assert.equal(mergeSort([makeScoreRecord()]).length, 1);
  });

  test("handles empty list", () => {
    assert.deepEqual(mergeSort([]), []);
  });
});

// ─── MM-07: detectMajors ──────────────────────────────────────────────────────

describe("MM-07 - detectMajors", () => {
  const student = makeRawStudent();

  test("assigns rank-1 as primary major", () => {
    const records = [
      makeScoreRecord({ plannerID: "DS", majorCoreScore: 0.75, matchPct: 66 }),
      makeScoreRecord({ plannerID: "AI", majorCoreScore: 0.38, matchPct: 44 }),
    ];
    const result = detectMajors(records, DEFAULT_CONFIG, student);
    assert.equal(result.primaryMajor?.plannerID, "DS");
    assert.equal(result.status, "detected");
  });

  test("assigns second major when rank-2 matchPct meets threshold", () => {
    const records = [
      makeScoreRecord({ plannerID: "DS", majorCoreScore: 0.9, matchPct: 80 }),
      makeScoreRecord({ plannerID: "SE", majorCoreScore: 0.7, matchPct: 72 }),
    ];
    const result = detectMajors(records, DEFAULT_CONFIG, student);
    assert.equal(result.secondMajor?.plannerID, "SE");
  });

  test("sets secondMajor to null when rank-2 matchPct is below threshold", () => {
    const records = [
      makeScoreRecord({ plannerID: "DS", majorCoreScore: 0.75, matchPct: 66 }),
      makeScoreRecord({ plannerID: "AI", majorCoreScore: 0.38, matchPct: 44 }),
    ];
    const result = detectMajors(records, DEFAULT_CONFIG, student);
    assert.equal(result.secondMajor, null);
  });

  test("returns noMajorDetected when rank-1 matchPct is below noMajorThreshold", () => {
    const records = [makeScoreRecord({ majorCoreScore: 0.1, matchPct: 15 })];
    const result = detectMajors(records, DEFAULT_CONFIG, student);
    assert.equal(result.status, "noMajorDetected");
    assert.equal(result.primaryMajor, null);
  });

  test("noMajorDetected still populates rankedPlanners", () => {
    const records = [
      makeScoreRecord({ plannerID: "A", majorCoreScore: 0.2, matchPct: 20 }),
      makeScoreRecord({ plannerID: "B", majorCoreScore: 0.1, matchPct: 10 }),
    ];
    const result = detectMajors(records, DEFAULT_CONFIG, student);
    assert.equal(result.rankedPlanners.length, 2);
  });

  test("returns noMajorDetected for empty score records", () => {
    const result = detectMajors([], DEFAULT_CONFIG, student);
    assert.equal(result.status, "noMajorDetected");
    assert.equal(result.primaryMajor, null);
  });

  test("sets status to overridden when manualOverride is provided", () => {
    const records = [makeScoreRecord({ majorCoreScore: 0.75, matchPct: 66 })];
    const result = detectMajors(records, DEFAULT_CONFIG, { ...student, manualOverride: "Software Engineering" });
    assert.equal(result.status, "overridden");
    assert.equal(result.manualOverride, "Software Engineering");
  });

  test("preserves algorithm result in algorithmPrimary when overridden", () => {
    const records = [makeScoreRecord({ plannerID: "DS", majorCoreScore: 0.75, matchPct: 66 })];
    const result = detectMajors(records, DEFAULT_CONFIG, { ...student, manualOverride: "Software Engineering" });
    assert.equal(result.algorithmPrimary?.plannerID, "DS");
  });
});

// ─── MM-08: buildDisplayPayload ───────────────────────────────────────────────

describe("MM-08 - buildDisplayPayload", () => {
  const primaryRecord = makeScoreRecord({
    plannerID: "DS",
    majorName: "Data Science",
    matchPct: 66,
    majorCoreScore: 0.75,
    coreMatched: 5,
    coreRequired: 8,
    missingCore: ["C6", "C7", "C8"],
    majorCoreMatched: 6,
    majorCoreRequired: 8,
    missingMajorCore: ["MC7", "MC8"],
  });

  test("payload contains correct studentID", () => {
    const result = { primaryMajor: primaryRecord, secondMajor: null, status: "detected" as const, rankedPlanners: [primaryRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.studentID, "102785914");
  });

  test("primaryMajor is populated correctly", () => {
    const result = { primaryMajor: primaryRecord, secondMajor: null, status: "detected" as const, rankedPlanners: [primaryRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.primaryMajor?.majorName, "Data Science");
    assert.equal(payload.primaryMajor?.matchPct, 66);
    assert.equal(payload.primaryMajor?.majorCoreScore, 0.75);
  });

  test("breakdown core matched and required are correct", () => {
    const result = { primaryMajor: primaryRecord, secondMajor: null, status: "detected" as const, rankedPlanners: [primaryRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.primaryMajor?.breakdown.core.matched, 5);
    assert.equal(payload.primaryMajor?.breakdown.core.required, 8);
    assert.deepEqual(payload.primaryMajor?.breakdown.core.missingUnits, ["C6", "C7", "C8"]);
  });

  test("secondMajor is null when not detected", () => {
    const result = { primaryMajor: primaryRecord, secondMajor: null, status: "detected" as const, rankedPlanners: [primaryRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.secondMajor, null);
  });

  test("secondMajor is populated when detected", () => {
    const secondRecord = makeScoreRecord({ plannerID: "SE", majorName: "Software Engineering", matchPct: 72 });
    const result = { primaryMajor: primaryRecord, secondMajor: secondRecord, status: "detected" as const, rankedPlanners: [primaryRecord, secondRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.secondMajor?.majorName, "Software Engineering");
  });

  test("topAlternatives has up to 3 records on noMajorDetected", () => {
    const records = [
      makeScoreRecord({ plannerID: "A", matchPct: 20 }),
      makeScoreRecord({ plannerID: "B", matchPct: 15 }),
      makeScoreRecord({ plannerID: "C", matchPct: 10 }),
      makeScoreRecord({ plannerID: "D", matchPct: 5 }),
    ];
    const result = { primaryMajor: null, secondMajor: null, status: "noMajorDetected" as const, rankedPlanners: records };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.topAlternatives.length, 3);
  });

  test("topAlternatives is empty when status is detected", () => {
    const result = { primaryMajor: primaryRecord, secondMajor: null, status: "detected" as const, rankedPlanners: [primaryRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.topAlternatives.length, 0);
  });

  test("isOverride is true and detectedPrimary is set when overridden", () => {
    const result = {
      primaryMajor: primaryRecord,
      secondMajor: null,
      status: "overridden" as const,
      rankedPlanners: [primaryRecord],
      manualOverride: "Software Engineering",
      algorithmPrimary: primaryRecord,
    };
    const payload = buildDisplayPayload("102785914", result);
    assert.equal(payload.isOverride, true);
    assert.equal(payload.detectedPrimary?.majorName, "Data Science");
  });

  test("detectedMinors is empty array until Phase 7 is implemented", () => {
    const result = { primaryMajor: primaryRecord, secondMajor: null, status: "detected" as const, rankedPlanners: [primaryRecord] };
    const payload = buildDisplayPayload("102785914", result);
    assert.deepEqual(payload.detectedMinors, []);
  });
});
