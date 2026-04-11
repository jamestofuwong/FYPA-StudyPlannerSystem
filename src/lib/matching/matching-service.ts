// ============================================================
// MM-01 – Matching Service Core
// Top-level orchestrator. Validates config, pre-loads data,
// then runs Phases 1–6 in sequence.
// No database queries occur during execution.
// ============================================================

import { AlgorithmConfig, DEFAULT_CONFIG, DisplayPayload, PlannerTemplate, RawStudentInput, UnitMasterEntry } from "../../types/matching";
import { validateConfig } from "./config-validator";
import { filterPlanners } from "./planner-filter";
import { normaliseUnitCodes } from "./unit-normalizer";
import { buildStudentProfile } from "./profile-builder";
import { scorePlanners } from "./scoring-engine";
import { detectMajors } from "./major-detector";
import { buildDisplayPayload } from "./output-packager";

export interface MatchingServiceInput {
  student: RawStudentInput;
  planners: PlannerTemplate[];
  unitMasterTable: UnitMasterEntry[];
  config?: Partial<AlgorithmConfig>;
}

export interface MatchingServiceResult {
  payload: DisplayPayload;
  durationMs: number;
}

/**
 * runMatchingPipeline
 *
 * Entry point for the major detection pipeline. Stateless – all state
 * is supplied as input. The same input always produces the same output.
 *
 * Phases:
 *  1 – Planner filtering       (filterPlanners)
 *  2a – Profile preparation    (normalise -> buildStudentProfile)
 *  2b – WIL adjustment         (inside scorePlanners)
 *  3  – Per-planner scoring    (scorePlanners)
 *  4  – Ranking                (detectMajors)
 *  5  – Major detection        (detectMajors)
 *  6  – Output packaging       (buildDisplayPayload)
 */
export function runMatchingPipeline(input: MatchingServiceInput): MatchingServiceResult {
  const start = performance.now();

  // Merge caller config with defaults
  const config: AlgorithmConfig = { ...DEFAULT_CONFIG, ...input.config };

  // Validate weight sum – reject before any execution
  validateConfig(config);

  // Phase 1 – Planner filtering
  const candidatePlanners = filterPlanners(
    input.planners,
    input.student.intakeYear,
    input.student.intakeSemester,
    config
  );

  // Phase 2a – Unit normalisation + profile preparation
  const normalisedCodes = normaliseUnitCodes(input.student.completedUnitCodes);
  const profile = buildStudentProfile(
    input.student,
    normalisedCodes,
    input.unitMasterTable
  );

  // Phases 2b + 3 – WIL adjustment + per-planner scoring
  const scoreRecords = scorePlanners(profile, candidatePlanners, config);

  // Phases 4 + 5 – Ranking + major detection
  const detectionResult = detectMajors(scoreRecords, config, input.student);

  // Phase 6 – Output packaging
  const payload = buildDisplayPayload(profile.studentID, detectionResult);

  const durationMs = Math.round(performance.now() - start);

  return { payload, durationMs };
}