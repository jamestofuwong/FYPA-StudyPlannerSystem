// @ts-nocheck
/**
 * Performance test for PERF-02: Major Detection Algorithm
 * Verifies REQ-PER-101: matching pipeline completes within 5 seconds
 * for a single student record at worst-case planner scale (REQ-SCA-102: 300 planners).
 *
 * Run with: npm test -- tests/performance/matching.perf.test.ts --verbose
 */
import { runMatchingPipeline } from "../../core/services/matching/matchingService";
import type {
  PlannerTemplate,
  RawStudentInput,
  UnitMasterEntry,
} from "../../core/shared/types/matching";

// --- Helpers -------------------------------------------------------------------

// Generates a unit code like COS10001, ICT20012, etc. 
function unitCode(prefix: string, n: number): string {
  return `${prefix}${String(10000 + n).slice(1)}`;
}

/**
 * Builds one realistic planner with:
 *   8 core units, 6 major-core units, 4 prescribed electives, 4 free elective slots
 */
function makePlanner(index: number, intakeYear: number): PlannerTemplate {
  const prefix = ["COS", "ICT", "MTH", "SWE", "NET", "DAT"][index % 6];
  const majorPrefix = ["AIS", "CYB", "DS", "SE", "NET", "IoT"][index % 6];

  const requiredCore = Array.from({ length: 8 }, (_, i) =>
    unitCode("COS", index * 100 + i)
  );
  const requiredMajorCore = new Set(
    Array.from({ length: 6 }, (_, i) => unitCode(prefix, index * 100 + 50 + i))
  );
  const prescribedPool = Array.from({ length: 8 }, (_, i) =>
    unitCode(majorPrefix, index * 100 + 80 + i)
  );
  const freePool = new Set(
    Array.from({ length: 12 }, (_, i) => unitCode("ELE", index * 100 + i))
  );

  return {
    plannerID: `planner-${index}`,
    majorName: `Major ${index}`,
    courseType: "degree" as const,
    durationSemesters: 6,
    intakeYear,
    intakeSemester: (index % 2) + 1 as 1 | 2,
    requiredCore,
    requiredMajorCore,
    prescribedElectiveCategories: [
      {
        categoryCode: `CAT-${index}`,
        pool: new Set(prescribedPool),
        slots: 4,
      },
    ],
    freeElectivePool: freePool,
    freeElectiveSlotsRequired: 4,
  };
}

// Builds one UnitMasterEntry per unique code seen across all planners.
function buildUnitMasterTable(planners: PlannerTemplate[]): UnitMasterEntry[] {
  const seen = new Map<string, UnitMasterEntry>();

  for (const p of planners) {
    const addEntry = (code: string, category: UnitMasterEntry["category"]) => {
      if (!seen.has(code)) {
        seen.set(code, { code, name: `Unit ${code}`, category, creditHours: 3, subjectTags: [], requisites: [] });
      }
    };
    p.requiredCore.forEach((c) => addEntry(c, "core"));
    [...p.requiredMajorCore].forEach((c) => addEntry(c, "majorCore"));
    p.prescribedElectiveCategories.forEach((cat) =>
      [...cat.pool].forEach((c) => addEntry(c, "prescribed"))
    );
    [...p.freeElectivePool].forEach((c) => addEntry(c, "freeElective"));
  }

  return [...seen.values()];
}

/**
 * Builds a student who has completed ~50% of one specific planner's units
 * plus some unrelated codes, giving the algorithm meaningful work to do.
 */
function makeStudent(targetPlanner: PlannerTemplate): RawStudentInput {
  const completedUnitCodes = [
    // Half the target planner's core units
    ...targetPlanner.requiredCore.slice(0, 4),
    // Half the target planner's major core units
    ...[...targetPlanner.requiredMajorCore].slice(0, 3),
    // Some prescribed electives from the target planner
    ...[...targetPlanner.prescribedElectiveCategories[0].pool].slice(0, 2),
    // Some free electives
    ...[...targetPlanner.freeElectivePool].slice(0, 2),
    // Noise: unrelated units the student also completed
    "COS99001", "ICT99002", "MTH99003",
  ];

  return {
    studentID: "102785914",
    courseType: "degree" as const,
    intakeYear: targetPlanner.intakeYear,
    intakeSemester: targetPlanner.intakeSemester,
    currentSemester: 1 as const,
    completedUnitCodes,
    hasWIL: false,
  };
}

//--- Dataset -------------------------------------------------------------------

const PLANNER_COUNT = 300; // REQ-SCA-102: system must support at least 300 planners
const INTAKE_YEAR   = 2024;
const SLA_MS        = 5000; // REQ-PER-101: must complete within 5 seconds

let planners: PlannerTemplate[];
let unitMasterTable: UnitMasterEntry[];
let student: RawStudentInput;

beforeAll(() => {
  planners = Array.from({ length: PLANNER_COUNT }, (_, i) =>
    makePlanner(i, INTAKE_YEAR)
  );
  unitMasterTable = buildUnitMasterTable(planners);
  student = makeStudent(planners[0]);
});

// --- Tests -------------------------------------------------------------------

describe("PERF-02 - Major Detection Algorithm (REQ-PER-101)", () => {
  beforeAll(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test(
    `completes within ${SLA_MS}ms for a single student against ${PLANNER_COUNT} planners`,
    () => {
      const result = runMatchingPipeline({
        student,
        planners,
        unitMasterTable,
        config: { preferIntakeYear: false }, // disable filtering so all 300 are scored
      });

      console.info(
        `[PERF-02] durationMs=${result.durationMs}ms  planners=${PLANNER_COUNT}  ` +
        `primaryMajor=${result.payload.primaryMajor?.majorName ?? "none"}`
      );

      expect(result.durationMs).toBeLessThan(SLA_MS);
    }
  );

  test(
    `worst-case: 3 consecutive runs all finish within ${SLA_MS}ms (no warm-up advantage)`,
    () => {
      const durations: number[] = [];

      for (let run = 0; run < 3; run++) {
        const result = runMatchingPipeline({
          student,
          planners,
          unitMasterTable,
          config: { preferIntakeYear: false },
        });
        durations.push(result.durationMs);
      }

      const worst = Math.max(...durations);
      console.info(`[PERF-02] 3-run durations: ${durations.join("ms, ")}ms  worst=${worst}ms`);

      expect(worst).toBeLessThan(SLA_MS);
    }
  );

  test(
    "returns a valid payload (algorithm correctness not degraded by scale)",
    () => {
      const result = runMatchingPipeline({
        student,
        planners,
        unitMasterTable,
        config: { preferIntakeYear: false },
      });

      expect(result.payload).toBeDefined();
      expect(result.payload.primaryMajor).not.toBeNull();
      expect(typeof result.payload.primaryMajor?.matchPct).toBe("number");
      expect(result.payload.primaryMajor?.matchPct).toBeGreaterThan(0);
    }
  );
});
