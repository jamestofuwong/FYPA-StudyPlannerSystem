// @ts-nocheck
/**
 * Algorithm Coverage Tests
 * Validates the matching algorithm works correctly with:
 *   - Foundation programs (typically 1 year)
 *   - Diploma programs (typically 2 years)
 *   - Degree programs (typically 3-4 years)
 *   - Different intake schedules (semester 1, semester 2)
 */

import { runMatchingPipeline } from "../../../core/services/matching/matchingService";
import type { PlannerTemplate, RawStudentInput, UnitMasterEntry } from "../../../core/shared/types/matching";

beforeAll(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Algorithm Coverage - Program Types", () => {
  // ----------------------------------------------------------------
  // Foundation Program (1 year, single intake)
  // ----------------------------------------------------------------
  test("handles Foundation program (1-year, single semester structure)", () => {
    const foundationPlanner: PlannerTemplate = {
      plannerID: "FND-001",
      majorName: "Foundation of Engineering",
      courseType: "foundation",
      durationSemesters: 2,
      intakeYear: 2024,
      intakeSemester: 1,
      requiredCore: ["ENG10001", "MATH10001", "PHYS10001"],
      requiredMajorCore: new Set(["ENG10002", "ENG10003"]),
      prescribedElectiveCategories: [
        {
          categoryCode: "ELEC-1",
          pool: new Set(["CHM10001", "BIO10001"]),
          slots: 1,
        },
      ],
      freeElectivePool: new Set(),
      freeElectiveSlotsRequired: 0,
    };

    const unitMasterTable: UnitMasterEntry[] = [
      ...foundationPlanner.requiredCore.map((code) => ({
        code,
        name: `Unit ${code}`,
        category: "core" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...[...foundationPlanner.requiredMajorCore].map((code) => ({
        code,
        name: `Unit ${code}`,
        category: "majorCore" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...[...foundationPlanner.prescribedElectiveCategories[0].pool].map((code) => ({
        code,
        name: `Unit ${code}`,
        category: "prescribed" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
    ];

    const student: RawStudentInput = {
      studentID: "900001",
      courseType: "foundation",
      intakeYear: 2024,
      intakeSemester: 1,
      currentSemester: 1,
      completedUnitCodes: ["ENG10001", "MATH10001", "CHM10001"],
      hasWIL: false,
    };

    const result = runMatchingPipeline({
      student,
      planners: [foundationPlanner],
      unitMasterTable,
    });

    expect(result.payload.primaryMajor).not.toBeNull();
    expect(result.payload.primaryMajor?.majorName).toBe("Foundation of Engineering");
    expect(result.payload.primaryMajor?.matchPct).toBeGreaterThan(50); // 3/5 core+major matched
  });

  // ----------------------------------------------------------------
  // Diploma Program (2 years, multiple intake options)
  // ----------------------------------------------------------------
  test("handles Diploma program (2-year structure, multiple semesters)", () => {
    const diplomaSem1: PlannerTemplate = {
      plannerID: "DIP-IT-2024-S1",
      majorName: "Diploma of Information Technology",
      courseType: "diploma",
      durationSemesters: 4,
      intakeYear: 2024,
      intakeSemester: 1,
      requiredCore: ["ICT10001", "ICT10002", "COS10009"],
      requiredMajorCore: new Set(["ICT10010", "ICT10011", "ICT20031"]),
      prescribedElectiveCategories: [
        {
          categoryCode: "ELEC-1",
          pool: new Set(["BUS10001", "MGT10005"]),
          slots: 2,
        },
      ],
      freeElectivePool: new Set(["GEN10001", "GEN10002"]),
      freeElectiveSlotsRequired: 2,
    };

    const diplomaSem2: PlannerTemplate = {
      ...diplomaSem1,
      plannerID: "DIP-IT-2024-S2",
      intakeSemester: 2,
    };

    const unitMasterTable: UnitMasterEntry[] = [
      ...diplomaSem1.requiredCore.map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "core" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...[...diplomaSem1.requiredMajorCore].map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "majorCore" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...diplomaSem1.prescribedElectiveCategories.flatMap((cat) =>
        [...cat.pool].map((c) => ({
          code: c,
          name: `Unit ${c}`,
          category: "prescribed" as const,
          creditHours: 3,
          subjectTags: [],
          requisites: [],
        }))
      ),
      ...[...diplomaSem1.freeElectivePool].map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "freeElective" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
    ];

    const student: RawStudentInput = {
      studentID: "900002",
      courseType: "diploma",
      intakeYear: 2024,
      intakeSemester: 2,
      currentSemester: 1,
      completedUnitCodes: ["ICT10001", "ICT10002", "ICT10010", "BUS10001", "GEN10001"],
      hasWIL: false,
    };

    const result = runMatchingPipeline({
      student,
      planners: [diplomaSem1, diplomaSem2],
      unitMasterTable,
    });

    expect(result.payload.primaryMajor).not.toBeNull();
    // Should match semester 2 intake better
    expect(result.payload.rankedPlanners[0].plannerID).toBe("DIP-IT-2024-S2");
  });

  // ----------------------------------------------------------------
  // Bachelor Degree (3-4 years, WIL component)
  // ----------------------------------------------------------------
  test("handles Bachelor degree (3-year with WIL placement)", () => {
    const degreePlanner: PlannerTemplate = {
      plannerID: "BA-CS-2024",
      majorName: "Bachelor of Computer Science",
      courseType: "degree",
      durationSemesters: 6,
      intakeYear: 2024,
      intakeSemester: 1,
      requiredCore: ["COS10009", "COS10026", "COS20031", "MTH10001"],
      requiredMajorCore: new Set([
        "COS20018",
        "COS20023",
        "COS30012",
        "COS30042",
        "COS30050",
      ]),
      prescribedElectiveCategories: [
        {
          categoryCode: "ELEC-GEN",
          pool: new Set(["COS20019", "COS20002", "COS30006"]),
          slots: 2,
        },
      ],
      freeElectivePool: new Set(["ICT20012", "ICT30014", "BUS10001"]),
      freeElectiveSlotsRequired: 4,
    };

    const unitMasterTable: UnitMasterEntry[] = [
      ...degreePlanner.requiredCore.map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "core" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...[...degreePlanner.requiredMajorCore].map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "majorCore" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...degreePlanner.prescribedElectiveCategories.flatMap((cat) =>
        [...cat.pool].map((c) => ({
          code: c,
          name: `Unit ${c}`,
          category: "prescribed" as const,
          creditHours: 3,
          subjectTags: [],
          requisites: [],
        }))
      ),
      ...[...degreePlanner.freeElectivePool].map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "freeElective" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
    ];

    const student: RawStudentInput = {
      studentID: "900003",
      courseType: "degree",
      intakeYear: 2024,
      intakeSemester: 1,
      currentSemester: 1,
      completedUnitCodes: [
        // Core units (3/4)
        "COS10009",
        "COS10026",
        "MTH10001",
        // Major core units (2/5)
        "COS20018",
        "COS20023",
        // Electives
        "COS20019",
        "ICT20012",
        "ICT30014",
        "BUS10001",
      ],
      hasWIL: true,
    };

    const result = runMatchingPipeline({
      student,
      planners: [degreePlanner],
      unitMasterTable,
    });

    expect(result.payload.primaryMajor).not.toBeNull();
    expect(result.payload.primaryMajor?.majorName).toBe("Bachelor of Computer Science");
    expect(result.payload.primaryMajor?.breakdown.wil.matched).toBe(1); // WIL completed
    expect(result.durationMs).toBeLessThan(5000);
  });

  // ----------------------------------------------------------------
  // Alternative Intake Pattern (Same program, different semester)
  // ----------------------------------------------------------------
  test("handles programs with alternative intake patterns (different semesters)", () => {
    const alternativePlanner: PlannerTemplate = {
      plannerID: "ALT-001",
      majorName: "Alternative Intake Program",
      courseType: "degree",
      durationSemesters: 6,
      intakeYear: 2024,
      intakeSemester: 2,
      requiredCore: ["CORE001", "CORE002"],
      requiredMajorCore: new Set(["MAJ001", "MAJ002"]),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set(),
      freeElectiveSlotsRequired: 0,
    };

    const unitMasterTable: UnitMasterEntry[] = [
      ...alternativePlanner.requiredCore.map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "core" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
      ...[...alternativePlanner.requiredMajorCore].map((c) => ({
        code: c,
        name: `Unit ${c}`,
        category: "majorCore" as const,
        creditHours: 3,
        subjectTags: [],
        requisites: [],
      })),
    ];

    const student: RawStudentInput = {
      studentID: "900004",
      courseType: "degree",
      intakeYear: 2024,
      intakeSemester: 2,
      currentSemester: 2,
      completedUnitCodes: ["CORE001", "MAJ001"],
      hasWIL: false,
    };

    const result = runMatchingPipeline({
      student,
      planners: [alternativePlanner],
      unitMasterTable,
    });

    expect(result.payload.primaryMajor).not.toBeNull();
    expect(result.durationMs).toBeLessThan(5000);
  });

  // ----------------------------------------------------------------
  // Cross-Program Comparison
  // ----------------------------------------------------------------
  test("correctly ranks different program types for a single student", () => {
    const foundationProgram: PlannerTemplate = {
      plannerID: "FND-001",
      majorName: "Foundation",
      courseType: "foundation",
      durationSemesters: 2,
      intakeYear: 2024,
      intakeSemester: 1,
      requiredCore: ["FND001", "FND002"],
      requiredMajorCore: new Set(),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set(),
      freeElectiveSlotsRequired: 0,
    };

    const diplomaProgram: PlannerTemplate = {
      plannerID: "DIP-001",
      majorName: "Diploma",
      courseType: "diploma",
      durationSemesters: 4,
      intakeYear: 2024,
      intakeSemester: 1,
      requiredCore: ["DIPA", "DIPB", "DIPC", "DIPD"],
      requiredMajorCore: new Set(["DIPE", "DIPF"]),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set(),
      freeElectiveSlotsRequired: 0,
    };

    const degreeProgram: PlannerTemplate = {
      plannerID: "BA-001",
      majorName: "Bachelor",
      courseType: "degree",
      durationSemesters: 6,
      intakeYear: 2024,
      intakeSemester: 1,
      requiredCore: ["BACA", "BACB", "BACC", "BACD"],
      requiredMajorCore: new Set(["BACE", "BACF", "BACG"]),
      prescribedElectiveCategories: [],
      freeElectivePool: new Set(),
      freeElectiveSlotsRequired: 0,
    };

    const unitMasterTable: UnitMasterEntry[] = [
      { code: "BACA", name: "Unit BACA", category: "core",      creditHours: 3, subjectTags: [], requisites: [] },
      { code: "BACB", name: "Unit BACB", category: "core",      creditHours: 3, subjectTags: [], requisites: [] },
      { code: "BACC", name: "Unit BACC", category: "core",      creditHours: 3, subjectTags: [], requisites: [] },
      { code: "BACD", name: "Unit BACD", category: "core",      creditHours: 3, subjectTags: [], requisites: [] },
      { code: "BACE", name: "Unit BACE", category: "majorCore", creditHours: 3, subjectTags: [], requisites: [] },
      { code: "BACF", name: "Unit BACF", category: "majorCore", creditHours: 3, subjectTags: [], requisites: [] },
      { code: "BACG", name: "Unit BACG", category: "majorCore", creditHours: 3, subjectTags: [], requisites: [] },
    ];

    // Student who matches Bachelor best (completed most bachelor units)
    const student: RawStudentInput = {
      studentID: "900005",
      courseType: "degree",
      intakeYear: 2024,
      intakeSemester: 1,
      currentSemester: 1,
      completedUnitCodes: ["BACA", "BACB", "BACC", "BACE", "BACF"],
      hasWIL: false,
    };

    const result = runMatchingPipeline({
      student,
      planners: [foundationProgram, diplomaProgram, degreeProgram],
      unitMasterTable,
    });

    expect(result.payload.primaryMajor?.majorName).toBe("Bachelor");
    expect(result.durationMs).toBeLessThan(5000);
  });
});
