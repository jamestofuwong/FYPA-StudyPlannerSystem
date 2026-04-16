// @ts-nocheck
import { DEFAULT_CONFIG, AlgorithmConfig, UnitMasterEntry, PlannerTemplate, RawStudentInput } from "../../../core/shared/types/matching";
import { validateConfig, ConfigValidationError } from "../../../core/services/matching/configValidator";
import { filterPlanners, PlannerFilterError } from "../../../core/services/matching/plannerFilter";
import { normaliseCode, normaliseUnitCodes } from "../../../core/services/matching/unitNormalizer";
import { buildStudentProfile } from "@/core/services/matching/profileBuilder";

// --- Helpers ---
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

describe("Matching Logic Unit Tests (Jest)", () => {
  //fix Cannot log after tests are done
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // --- MM-01: Config Validator ---
  describe("MM-01: Config Validation", () => {
    test("accepts valid config", () => {
      expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
    });
    test("throws on negative weights", () => {
      const bad = { ...DEFAULT_CONFIG, weightCore: -0.1 };
      expect(() => validateConfig(bad)).toThrow();
    });
    test("throws when secondMajorThreshold is > 1.0 (Line 70)", () => {
      const bad = { ...DEFAULT_CONFIG, secondMajorThreshold: 1.5 };
      expect(() => validateConfig(bad)).toThrow();
    });

    test("throws when minorUnitThreshold is < 1 (Line 76)", () => {
      const bad = { ...DEFAULT_CONFIG, minorUnitThreshold: 0 };
      expect(() => validateConfig(bad)).toThrow();
    });
  });

  // --- MM-02: Planner Filter ---
  describe("MM-02: Planner Filter Fallbacks", () => {
    test("exact match", () => {
      const planners = [makePlanner({ intakeYear: 2024, plannerID: "MATCH" })];
      const result = filterPlanners(planners, 2024, 1, DEFAULT_CONFIG);
      expect(result[0].plannerID).toBe("MATCH");
    });

    test("fallback to most recent (Line 76-94)", () => {
      const planners = [makePlanner({ intakeYear: 2022, plannerID: "LATEST" })];
      const config = { ...DEFAULT_CONFIG, preferIntakeYear: false };
      const result = filterPlanners(planners, 2025, 1, config);
      expect(result[0].plannerID).toBe("LATEST");
    });
  });

  // --- MM-03: Normalizer ---
  describe("MM-03 - unit normaliser", () => {
    test("converts and trims", () => {
      expect(normaliseCode("  cos10009  ")).toBe("COS10009");
    });
  });

  // --- MM-04: Profile Builder ---
  describe("MM-04 - buildStudentProfile", () => {
    const masterTable = [
      makeMasterEntry({ code: "COS10009", category: "core" }),
      makeMasterEntry({ code: "COS10022", category: "majorCore" }),
    ];

    test("classifies units correctly", () => {
      const normalised = new Set(["COS10009", "COS10022"]);
      const profile = buildStudentProfile(makeRawStudent(), normalised, masterTable);
      expect(profile.completedCore.has("COS10009")).toBe(true);
      expect(profile.completedMajorCore.has("COS10022")).toBe(true);
    });

    test("excludes unclassified units", () => {
      const profile = buildStudentProfile(makeRawStudent(), new Set(["UNKNOWN999"]), masterTable);
      expect(profile.unclassifiedUnits).toContain("UNKNOWN999");
      expect(profile.completedCore.has("UNKNOWN999")).toBe(false);
    });
  });
  test("should classify units as unclassified (Line 60-67)", () => {
    const masterTable = [makeMasterEntry({ code: "KNOWN" })];
    const studentUnits = new Set(["KNOWN", "STRANGE_UNIT_999"]);
    
    const profile = buildStudentProfile(makeRawStudent(), studentUnits, masterTable);
    
    expect(profile.unclassifiedUnits).toContain("STRANGE_UNIT_999");
    expect(profile.completedUnits.has("STRANGE_UNIT_999")).toBe(true);
  });

  describe("Planner Filter Edge Cases", () => {
    test("should cover fallback to most recent year (Line 76-94)", () => {
      const planners = [
        makePlanner({ intakeYear: 2021, plannerID: "OLD" }),
        makePlanner({ intakeYear: 2022, plannerID: "NEW" })
      ];
      const config = { ...DEFAULT_CONFIG, preferIntakeYear: false };
      
      // Student is 2025 (no match), should pick 2022
      const result = filterPlanners(planners, 2025, 1, config);
      expect(result[0].plannerID).toBe("NEW");
    });

    test("should handle missing semester by returning all planners for that year (Line 45)", () => {
      const planners = [makePlanner({ intakeYear: 2024, intakeSemester: 1 })];
      // Student is Sem 2, but year only has Sem 1
      const result = filterPlanners(planners, 2024, 2, DEFAULT_CONFIG);
      expect(result).toHaveLength(1);
    });

    test("should handle WIL category units (Line 66)", () => {
      const masterTable = [makeMasterEntry({ code: "PROJ1", category: "WIL" })];
      const profile = buildStudentProfile(makeRawStudent(), new Set(["PROJ1"]), masterTable);
      
      // This triggers 'case WIL' and 'break' which are currently red
      expect(profile.completedUnits.has("PROJ1")).toBe(true);
    });
  });

  test("Profile Builder Edge Cases (Lines 60-64, 73-77)", () => {
    const master = [makeMasterEntry({ code: "CORE1" })];
    // 1. Pass an empty string and a null-like value to trigger Line 73-77
    const studentUnits = new Set(["CORE1", "", "   ", null]); 
    
    // 2. Pass a unit that is NOT in the master table to trigger Line 60-64
    studentUnits.add("MYSTERY_UNIT");

    const profile = buildStudentProfile(makeRawStudent(), studentUnits, master);
    
    expect(profile.unclassifiedUnits).toContain("MYSTERY_UNIT");
    expect(profile.completedUnits.has("CORE1")).toBe(true);
  });
});