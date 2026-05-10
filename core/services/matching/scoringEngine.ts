// ============================================================
// MM-05 – Scoring Engine (Phases 2b + 3)
// Phase 2b: WIL exemption adjustment
// Phase 3:  Per-planner weighted scoring loop
// ============================================================

import {
  AlgorithmConfig,
  PlannerScoreRecord,
  PlannerTemplate,
  StudentProfile,
} from "../../shared/types/matching";

/**
 * scorePlanners
 *
 * Runs Phases 2b and 3 for every candidate planner.
 * Returns one PlannerScoreRecord per planner, unsorted.
 * Sorting and detection happen in MM-07.
 */
export function scorePlanners(
  profile: StudentProfile,
  planners: PlannerTemplate[],
  config: AlgorithmConfig
): PlannerScoreRecord[] {
  return planners.map((planner) => scoreSinglePlanner(profile, planner, config));
}

// ====== Phase 2b - WIL Exemption Adjustment ===============================

/**
 * applyWILExemption
 *
 * WIL exemption reduces the number of free elective slots the student
 * is required to fill - not core units. In Y3S2, students pick their
 * own free electives, and WIL approval exempts 2 of those slots.
 *
 * Returns the adjusted freeElectiveSlotsRequired denominator.
 */
export function applyWILExemption(
  freeElectiveSlotsRequired: number,
  hasWIL: boolean,
  wilExemptionCount: number
): number {
  if (!hasWIL || wilExemptionCount <= 0) {
    return freeElectiveSlotsRequired;
  }
  return Math.max(0, freeElectiveSlotsRequired - wilExemptionCount);
}

// ====== Phase 3 – Per-Planner Scoring =========================================

function scoreSinglePlanner(
  profile: StudentProfile,
  planner: PlannerTemplate,
  config: AlgorithmConfig
): PlannerScoreRecord {
  const wilExemptionApplied = profile.hasWIL && config.wilExemptionCount > 0;

  // Phase 2b – adjust free elective slots denominator for WIL students
  const freeElectiveSlotsAdj = applyWILExemption(
    planner.freeElectiveSlotsRequired,
    profile.hasWIL,
    config.wilExemptionCount
  );

  // 3a – Core score (WIL does not affect core)
  const coreResult = scoreCore(profile.completedCore, planner.requiredCore);

  // 3b – Major core score (primary ranking signal)
  const majorCoreResult = scoreMajorCore(
    profile.completedMajorCore,
    planner.requiredMajorCore
  );

  // 3c – Prescribed elective score
  const prescribedResult = scorePrescribed(
    profile.completedPrescribed,
    planner.prescribedElectiveCategories
  );

  // 3d – Free elective score (uses WIL-adjusted slot count)
  const freeResult = scoreFreeElectives(
    profile.completedFreeElectives,
    planner.freeElectivePool,
    freeElectiveSlotsAdj
  );

  // 3e – WIL score
  const wilScore = profile.hasWIL ? 1.0 : 0.0;

  // 3f – Weighted aggregate
  const matchScore =
    coreResult.score       * config.weightCore +
    majorCoreResult.score  * config.weightMajorCore +
    prescribedResult.score * config.weightPrescribedElective +
    freeResult.score       * config.weightFreeElective +
    wilScore               * config.weightWIL;

  const matchPct = parseFloat((matchScore * 100).toFixed(1));

  // MM-06 – Missing unit lists
  const missingCore = planner.requiredCore.filter(
    (code) => !profile.completedCore.has(code)
  );

  const missingMajorCore = [...planner.requiredMajorCore].filter(
    (code) => !profile.completedMajorCore.has(code)
  );

  const missingPrescribed = planner.prescribedElectiveCategories.map((cat) => {
    const matched = Math.min(
      [...profile.completedPrescribed].filter((c) => cat.pool.has(c)).length,
      cat.slots
    );
    return {
      categoryCode: cat.categoryCode,
      unfilledSlots: Math.max(0, cat.slots - matched),
    };
  });

  // Missing free slots uses the adjusted denominator
  const missingFreeSlots = Math.max(0, freeElectiveSlotsAdj - freeResult.matched);

  return {
    plannerID: planner.plannerID,
    majorName: planner.majorName,
    courseType: planner.courseType,
    intakeYear: planner.intakeYear,
    intakeSemester: planner.intakeSemester,
    matchPct,
    majorCoreScore: majorCoreResult.score,
    coreMatched: coreResult.matched,
    coreRequired: planner.requiredCore.length,
    majorCoreMatched: majorCoreResult.matched,
    majorCoreRequired: planner.requiredMajorCore.size,
    prescribedMatched: prescribedResult.matched,
    prescribedPossible: prescribedResult.possible,
    freeMatched: freeResult.matched,
    freePossible: freeElectiveSlotsAdj,
    wilScore,
    wilExemptionApplied,
    missingCore,
    missingMajorCore,
    missingPrescribed,
    missingFreeSlots,
    requisiteFlags: profile.requisiteFlags,
  };
}

// --- Sub-scorers ------------------------------------------------

interface ScoreResult {
  score: number;
  matched: number;
}

/** 3a – Core score [weight: 0.40] */
function scoreCore(completedCore: Set<string>, requiredCore: string[]): ScoreResult {
  if (requiredCore.length === 0) {
    console.warn("[ScoringEngine] Planner has zero required core units. Core score = 0.");
    return { score: 0, matched: 0 };
  }
  const matched = requiredCore.filter((code) => completedCore.has(code)).length;
  return { score: matched / requiredCore.length, matched };
}

/** 3b – Major core score [weight: 0.30] */
function scoreMajorCore(completedMajorCore: Set<string>, requiredMajorCore: Set<string>): ScoreResult {
  if (requiredMajorCore.size === 0) {
    console.warn("[ScoringEngine] Planner has zero required major core units. Major core score = 0.");
    return { score: 0, matched: 0 };
  }
  const matched = [...requiredMajorCore].filter((code) =>
    completedMajorCore.has(code)
  ).length;
  return { score: matched / requiredMajorCore.size, matched };
}

/** 3c – Prescribed elective score [weight: 0.20]
 *  If the planner has no prescribed elective categories, the student
 *  has nothing to fulfill - full marks (1.0) are awarded automatically.
 */
function scorePrescribed(
  completedPrescribed: Set<string>,
  categories: PlannerTemplate["prescribedElectiveCategories"]
): ScoreResult & { possible: number } {
  if (categories.length === 0) {
    return { score: 1.0, matched: 0, possible: 0 };
  }

  let totalMatched = 0;
  let totalPossible = 0;

  for (const cat of categories) {
    const matchedInCat = [...completedPrescribed].filter((c) =>
      cat.pool.has(c)
    ).length;
    totalMatched += Math.min(matchedInCat, cat.slots);
    totalPossible += cat.slots;
  }

  // All categories have 0 slots -> treat same as no prescribed electives.
  if (totalPossible === 0) {
    return { score: 1.0, matched: 0, possible: 0 };
  }

  return {
    score: totalMatched / totalPossible,
    matched: totalMatched,
    possible: totalPossible,
  };
}

/** 3d – Free elective score [weight: 0.05]
 *  Uses WIL-adjusted slot count as denominator.
 *  If adjusted slots reach 0 (WIL exempted all of them), the student
 *  has nothing left to fulfill - full marks (1.0) are awarded automatically.
 */
function scoreFreeElectives(
  completedFreeElectives: Set<string>,
  freeElectivePool: Set<string>,
  slotsRequired: number  // already WIL-adjusted
): ScoreResult {
  // No free elective slots to fill - nothing to fulfill, full score.
  if (slotsRequired === 0) {
    return { score: 1.0, matched: 0 };
  }
  const inPool = [...completedFreeElectives].filter((c) => freeElectivePool.has(c)).length;
  const matched = Math.min(inPool, slotsRequired);
  return { score: matched / slotsRequired, matched };
}