// ============================================================
// MM-02 – Planner Filter (Phase 1)
// Three-level hierarchy: intake year -> intake semester -> scoring.
// Scoring (Level 3) is handled in Phase 3 (scoringEngine.ts).
// ============================================================

import { AlgorithmConfig, PlannerTemplate } from "../../shared/types/matching";

export class PlannerFilterError extends Error {
  constructor(message: string) {
    super(`[SUMS PlannerFilter] ${message}`);
    this.name = "PlannerFilterError";
  }
}

/**
 * filterPlanners
 *
 * Returns the candidate planner set for scoring.
 *
 * Level 1: filter by intakeYear
 * Level 2: within Level 1, filter by intakeSemester
 * Fallback chain:
 *   - Level 2 empty -> relax to Level 1
 *   - Level 1 empty + preferIntakeYear=false -> use most recent planner
 *   - Level 1 empty + preferIntakeYear=true  -> throw PlannerFilterError
 */

export function filterPlanners(
  allPlanners: PlannerTemplate[],
  studentIntakeYear: number,
  studentIntakeSemester: 1 | 2,
  config: AlgorithmConfig
): PlannerTemplate[] {
  if (allPlanners.length === 0) {
    throw new PlannerFilterError("No planner templates are loaded.");
  }

  // Level 1 – intake year
  const level1 = allPlanners.filter(
    (p) => p.intakeYear === studentIntakeYear
  );

  if (level1.length === 0) {
    return handleNoYearMatch(allPlanners, studentIntakeYear, studentIntakeSemester, config);
  }

  // Level 2 – intake semester (within Level 1)
  const level2 = level1.filter(
    (p) => p.intakeSemester === studentIntakeSemester
  );

  if (level2.length === 0) {
    // The intake semester outweighs the year: an Aug/Sept student on a Feb/Mar planner has every slot in the wrong
    // calendar semester. So the most recent year that has their intake semester is tried before the other semester.
    const sameSemester = allPlanners.filter((p) => p.intakeSemester === studentIntakeSemester);
    if (sameSemester.length > 0 && !config.preferIntakeYear) {
      const year = Math.max(...sameSemester.map((p) => p.intakeYear));
      console.warn(
        `[PlannerFilter] No planners for intakeYear=${studentIntakeYear}, intakeSemester=${studentIntakeSemester}. ` +
        `Falling back to the same intake semester in year ${year}.`
      );
      return sameSemester.filter((p) => p.intakeYear === year);
    }

    // Fallback: relax to Level 1 results
    console.warn(
      `[PlannerFilter] No planners found for intakeYear=${studentIntakeYear}, ` +
      `intakeSemester=${studentIntakeSemester}. ` +
      `Falling back to Level 1 (all ${level1.length} planners for year ${studentIntakeYear}).`
    );
    return level1;
  }

  return level2;
}

/**
 * handleNoYearMatch
 *
 * Called when Level 1 yields no candidates.
 */
function handleNoYearMatch(
  allPlanners: PlannerTemplate[],
  studentIntakeYear: number,
  studentIntakeSemester: 1 | 2,
  config: AlgorithmConfig
): PlannerTemplate[] {
  if (config.preferIntakeYear) {
    throw new PlannerFilterError(
      `No planners found for intakeYear=${studentIntakeYear} and preferIntakeYear=true. ` +
      `Cannot proceed. Please load a planner template for this intake year.`
    );
  }

  // preferIntakeYear=false - use the most recent planner(s) of the student's intake semester, or of any semester
  // when none has it, so an Aug/Sept student is not put on a Feb/Mar planner while an Aug/Sept one exists.
  const sameSemester = allPlanners.filter((p) => p.intakeSemester === studentIntakeSemester);
  const sorted = [...(sameSemester.length > 0 ? sameSemester : allPlanners)].sort((a, b) => b.intakeYear - a.intakeYear);
  const mostRecentYear = sorted[0].intakeYear;
  const mostRecent = sorted.filter((p) => p.intakeYear === mostRecentYear);

  console.warn(
    `[PlannerFilter] No planners for intakeYear=${studentIntakeYear}. ` +
    `preferIntakeYear=false, falling back to most recent year=${mostRecentYear} ` +
    `(${mostRecent.length} planner(s)).`
  );

  return mostRecent;
}
