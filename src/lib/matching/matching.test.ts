// ============================================================
// matching.test.ts
// Unit tests for MM-01 through MM-04
// Uses Node.js built-in test runner — no Jest required.
//
// Run with:
//   npx tsx --test src/lib/matching/matching.test.ts
// ============================================================

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG, AlgorithmConfig, UnitMasterEntry, PlannerTemplate, RawStudentInput } from "../../types/matching";
import { validateConfig, ConfigValidationError } from "./config-validator";
import { filterPlanners, PlannerFilterError } from "./planner-filter";
import { normaliseCode, normaliseUnitCodes } from "./unit-normalizer";
import { buildStudentProfile } from "./profile-builder";

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

function makeMasterEntry(overrides: Partial<UnitMasterEntry>): UnitMasterEntry {
  return {
    code: "COS10009",
    name: "Introduction to Programming",
    category: "core",
    creditHours: 3,
    subjectTags: [],
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

// ─── MM-01: Config Validator ──────────────────────────────────────────────────

describe("MM-01 - validateConfig", () => {
  test("accepts valid default config", () => {
    assert.doesNotThrow(() => validateConfig(DEFAULT_CONFIG));
  });

  test("throws when weights sum to less than 1.0", () => {
    const bad: AlgorithmConfig = { ...DEFAULT_CONFIG, weightCore: 0.30 };
    assert.throws(() => validateConfig(bad), ConfigValidationError);
  });

  test("throws when weights sum to more than 1.0", () => {
    const bad: AlgorithmConfig = { ...DEFAULT_CONFIG, weightCore: 0.50 };
    assert.throws(() => validateConfig(bad), ConfigValidationError);
  });

  test("throws when a weight is negative", () => {
    const bad: AlgorithmConfig = { ...DEFAULT_CONFIG, weightFreeElective: -0.05, weightCore: 0.50 };
    assert.throws(() => validateConfig(bad), ConfigValidationError);
  });

  test("throws when wilExemptionCount is negative", () => {
    const bad: AlgorithmConfig = { ...DEFAULT_CONFIG, wilExemptionCount: -1 };
    assert.throws(() => validateConfig(bad), ConfigValidationError);
  });

  test("throws when secondMajorThreshold is out of range", () => {
    const bad: AlgorithmConfig = { ...DEFAULT_CONFIG, secondMajorThreshold: 1.5 };
    assert.throws(() => validateConfig(bad), ConfigValidationError);
  });

  test("throws when minorUnitThreshold is less than 1", () => {
    const bad: AlgorithmConfig = { ...DEFAULT_CONFIG, minorUnitThreshold: 0 };
    assert.throws(() => validateConfig(bad), ConfigValidationError);
  });

  test("tolerates floating-point rounding", () => {
    const config: AlgorithmConfig = {
      ...DEFAULT_CONFIG,
      weightCore: 0.1,
      weightMajorCore: 0.2,
      weightPrescribedElective: 0.3,
      weightFreeElective: 0.2,
      weightWIL: 0.2,
    };
    assert.doesNotThrow(() => validateConfig(config));
  });
});

// ─── MM-02: Planner Filter ────────────────────────────────────────────────────

describe("MM-02 - filterPlanners", () => {
  const planners: PlannerTemplate[] = [
    makePlanner({ plannerID: "BA-CS-2024-S1", intakeYear: 2024, intakeSemester: 1, majorName: "Data Science" }),
    makePlanner({ plannerID: "BA-CS-2024-S2", intakeYear: 2024, intakeSemester: 2, majorName: "Data Science S2" }),
    makePlanner({ plannerID: "BA-CS-2023-S1", intakeYear: 2023, intakeSemester: 1, majorName: "Software Engineering" }),
    makePlanner({ plannerID: "BA-CS-2025-S1", intakeYear: 2025, intakeSemester: 1, majorName: "Cybersecurity" }),
  ];

  test("exact match on year and semester returns only that planner", () => {
    const result = filterPlanners(planners, 2024, 1, DEFAULT_CONFIG);
    assert.equal(result.length, 1);
    assert.equal(result[0].plannerID, "BA-CS-2024-S1");
  });

  test("Level 2 fallback: no semester match returns all Level 1 results", () => {
    // 2023 only has S1, student is S2 - falls back to all 2023 planners
    const result = filterPlanners(planners, 2023, 2, DEFAULT_CONFIG);
    assert.equal(result.length, 1);
    assert.equal(result[0].plannerID, "BA-CS-2023-S1");
  });

  test("preferIntakeYear=true, no year match throws PlannerFilterError", () => {
    const config = { ...DEFAULT_CONFIG, preferIntakeYear: true };
    assert.throws(() => filterPlanners(planners, 2020, 1, config), PlannerFilterError);
  });

  test("preferIntakeYear=false, no year match returns most recent planners", () => {
    const config = { ...DEFAULT_CONFIG, preferIntakeYear: false };
    const result = filterPlanners(planners, 2020, 1, config);
    // Most recent year is 2025
    assert.equal(result.length, 1);
    assert.equal(result[0].plannerID, "BA-CS-2025-S1");
  });

  test("throws when planner list is empty", () => {
    assert.throws(() => filterPlanners([], 2024, 1, DEFAULT_CONFIG), PlannerFilterError);
  });

  test("returns all planners when multiple majors share the same year and semester", () => {
    const multi = [
      makePlanner({ plannerID: "BA-CS-DS",  intakeYear: 2024, intakeSemester: 1, majorName: "Data Science" }),
      makePlanner({ plannerID: "BA-CS-SE",  intakeYear: 2024, intakeSemester: 1, majorName: "Software Engineering" }),
      makePlanner({ plannerID: "BA-CS-CYB", intakeYear: 2024, intakeSemester: 1, majorName: "Cybersecurity" }),
    ];
    const result = filterPlanners(multi, 2024, 1, DEFAULT_CONFIG);
    assert.equal(result.length, 3);
  });
});

// ─── MM-03: Unit Normaliser ───────────────────────────────────────────────────

describe("MM-03 - unit normaliser", () => {
  describe("normaliseCode", () => {
    test("converts to uppercase", () => {
      assert.equal(normaliseCode("cos10009"), "COS10009");
    });

    test("trims leading and trailing whitespace", () => {
      assert.equal(normaliseCode("  COS10009  "), "COS10009");
    });

    test("trims and uppercases together", () => {
      assert.equal(normaliseCode("  cos10009  "), "COS10009");
    });

    test("leaves already-normalised code unchanged", () => {
      assert.equal(normaliseCode("COS10009"), "COS10009");
    });
  });

  describe("normaliseUnitCodes", () => {
    test("deduplicates equivalent codes", () => {
      const result = normaliseUnitCodes(["COS10009", "COS10009", "cos10009"]);
      assert.equal(result.size, 1);
      assert.ok(result.has("COS10009"));
    });

    test("normalises mixed-case inputs", () => {
      const result = normaliseUnitCodes(["cos10009", "COS10026", "cOs10022"]);
      assert.ok(result.has("COS10009"));
      assert.ok(result.has("COS10026"));
      assert.ok(result.has("COS10022"));
    });

    test("skips empty strings and whitespace-only entries", () => {
      const result = normaliseUnitCodes(["", "   ", "COS10009"]);
      assert.equal(result.size, 1);
    });

    test("returns empty Set for empty input", () => {
      assert.equal(normaliseUnitCodes([]).size, 0);
    });
  });
});

// ─── MM-04: Profile Builder ───────────────────────────────────────────────────

describe("MM-04 - buildStudentProfile", () => {
  const masterTable: UnitMasterEntry[] = [
    makeMasterEntry({ code: "COS10009", category: "core",         subjectTags: [] }),
    makeMasterEntry({ code: "COS10026", category: "core",         subjectTags: [] }),
    makeMasterEntry({ code: "COS10022", category: "majorCore",    subjectTags: [] }),
    makeMasterEntry({ code: "COS20031", category: "majorCore",    subjectTags: [] }),
    makeMasterEntry({ code: "COS30049", category: "prescribed",   subjectTags: ["AI", "ML"] }),
    makeMasterEntry({ code: "COS30045", category: "freeElective", subjectTags: ["AI"] }),
  ];

  const normalisedCodes = new Set([
    "COS10009", "COS10026", "COS10022", "COS20031", "COS30049", "COS30045",
  ]);
  const raw = makeRawStudent();

  test("classifies core units correctly", () => {
    const profile = buildStudentProfile(raw, normalisedCodes, masterTable);
    assert.ok(profile.completedCore.has("COS10009"));
    assert.ok(profile.completedCore.has("COS10026"));
  });

  test("classifies major core units correctly", () => {
    const profile = buildStudentProfile(raw, normalisedCodes, masterTable);
    assert.ok(profile.completedMajorCore.has("COS10022"));
    assert.ok(profile.completedMajorCore.has("COS20031"));
  });

  test("classifies prescribed electives correctly", () => {
    const profile = buildStudentProfile(raw, normalisedCodes, masterTable);
    assert.ok(profile.completedPrescribed.has("COS30049"));
  });

  test("classifies free electives correctly", () => {
    const profile = buildStudentProfile(raw, normalisedCodes, masterTable);
    assert.ok(profile.completedFreeElectives.has("COS30045"));
  });

  test("populates electivesByTag for minor detection", () => {
    const profile = buildStudentProfile(raw, normalisedCodes, masterTable);
    // COS30049 has tags [AI, ML], COS30045 has tag [AI]
    assert.ok(profile.electivesByTag.get("AI")?.has("COS30049"));
    assert.ok(profile.electivesByTag.get("AI")?.has("COS30045"));
    assert.ok(profile.electivesByTag.get("ML")?.has("COS30049"));
  });

  test("excludes unclassified units from all category sets", () => {
    const withUnknown = new Set([...normalisedCodes, "UNKNOWN999"]);
    const profile = buildStudentProfile(raw, withUnknown, masterTable);
    assert.ok(profile.unclassifiedUnits.includes("UNKNOWN999"));
    assert.ok(profile.completedUnits.has("UNKNOWN999"));
    assert.ok(!profile.completedCore.has("UNKNOWN999"));
  });

  test("completedUnits contains all codes including unclassified", () => {
    const withUnknown = new Set([...normalisedCodes, "UNKNOWN999"]);
    const profile = buildStudentProfile(raw, withUnknown, masterTable);
    assert.equal(profile.completedUnits.size, withUnknown.size);
  });

  test("handles empty unit set without errors", () => {
    const profile = buildStudentProfile(raw, new Set(), masterTable);
    assert.equal(profile.completedCore.size, 0);
    assert.equal(profile.completedMajorCore.size, 0);
    assert.equal(profile.electivesByTag.size, 0);
    assert.equal(profile.unclassifiedUnits.length, 0);
  });

  test("WIL units are not placed in any category set", () => {
    const wilEntry = makeMasterEntry({ code: "PRO20001", category: "WIL", subjectTags: [] });
    const profile = buildStudentProfile(raw, new Set(["PRO20001"]), [...masterTable, wilEntry]);
    assert.ok(!profile.completedCore.has("PRO20001"));
    assert.ok(!profile.completedMajorCore.has("PRO20001"));
    assert.ok(!profile.completedPrescribed.has("PRO20001"));
    assert.ok(!profile.completedFreeElectives.has("PRO20001"));
    assert.ok(!profile.unclassifiedUnits.includes("PRO20001"));
  });

  test("preserves student metadata from raw input", () => {
    const rawWithData = makeRawStudent({
      studentID: "102785914",
      intakeYear: 2024,
      intakeSemester: 1,
      hasWIL: true,
    });
    const profile = buildStudentProfile(rawWithData, new Set(), masterTable);
    assert.equal(profile.studentID, "102785914");
    assert.equal(profile.intakeYear, 2024);
    assert.equal(profile.intakeSemester, 1);
    assert.equal(profile.hasWIL, true);
  });
});