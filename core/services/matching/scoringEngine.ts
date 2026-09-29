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

  // Scoring works from the student's full completed set and lets THIS planner's own lists and pools decide
  // what each unit satisfies. It deliberately does not use profile.completedCore and friends: those are built
  // by profileBuilder.ts from the single global category unitMasterTableBuilder.ts resolves for a unit across
  // every planner, where major_core beats prescribed_elective beats core. A unit that is core here but
  // major_core in another major therefore never landed in completedCore, so this planner's core score was
  // short by that unit and its missingCore listed a unit the student had passed. Nine of the 65 units in the
  // loaded planners sit in more than one category, so several planners were scoring below their real match.
  const completed = profile.completedUnits;

  // 3a – Core score (WIL does not affect core)
  const coreResult = scoreCore(completed, planner.requiredCore);

  // 3b – Major core score (primary ranking signal)
  const majorCoreResult = scoreMajorCore(completed, planner.requiredMajorCore);

  // A unit filling a slotted core or major core requirement must not also fill an elective slot in the same
  // planner, so it comes out before the pools are scored. None of the 45 loaded planners has that overlap
  // today; this keeps a later planner import from quietly inflating a score by counting one unit twice.
  const slotted = new Set<string>([...planner.requiredCore, ...planner.requiredMajorCore]);
  const completedForPools = without(completed, slotted);

  // 3c – Prescribed elective score
  const prescribedResult = scorePrescribed(
    completedForPools,
    planner.prescribedElectiveCategories
  );

  // 3d – Free elective score (uses WIL-adjusted slot count). Same reasoning as above one level down: a unit
  // already counted against a prescribed pool does not count again as a free elective.
  const prescribedPool = new Set<string>(
    planner.prescribedElectiveCategories.flatMap((cat) => [...cat.pool])
  );
  const freeResult = scoreFreeElectives(
    without(completedForPools, prescribedPool),
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

  // MM-06 – Missing unit lists. Against the full completed set for the same reason as the scores above: a
  // unit the student has passed must never be reported as missing just because another major files it under
  // a different category. core/services/classEstimation reads these lists to decide what to enrol a student
  // in next semester, so a false entry there became a recommendation to retake a unit already passed.
  const missingCore = planner.requiredCore.filter((code) => !completed.has(code));

  const missingMajorCore = [...planner.requiredMajorCore].filter(
    (code) => !completed.has(code)
  );

  const missingPrescribed = prescribedResult.perCategory.map(({ categoryCode, matched, slots }) => ({
    categoryCode,
    unfilledSlots: Math.max(0, slots - matched),
  }));

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

/**
 * source minus exclude, without mutating either. Returns source itself when there is nothing to take out,
 * which is the normal case, so the common path allocates nothing.
 */
function without(source: Set<string>, exclude: Set<string>): Set<string> {
  if (exclude.size === 0) return source;
  const out = new Set<string>();
  for (const code of source) {
    if (!exclude.has(code)) out.add(code);
  }
  return out;
}

interface ScoreResult {
  score: number;
  matched: number;
}

interface PrescribedCategoryResult {
  categoryCode: string;
  matched: number;
  slots: number;
}

/** 3a – Core score [weight: 0.40]. `completed` is the student's whole completed set: what counts as core is
 *  decided by this planner's requiredCore, not by any category attached to the unit itself. */
function scoreCore(completed: Set<string>, requiredCore: string[]): ScoreResult {
  if (requiredCore.length === 0) {
    console.warn("[ScoringEngine] Planner has zero required core units. Core score = 0.");
    return { score: 0, matched: 0 };
  }
  const matched = requiredCore.filter((code) => completed.has(code)).length;
  return { score: matched / requiredCore.length, matched };
}

/** 3b – Major core score [weight: 0.30] */
function scoreMajorCore(completed: Set<string>, requiredMajorCore: Set<string>): ScoreResult {
  if (requiredMajorCore.size === 0) {
    console.warn("[ScoringEngine] Planner has zero required major core units. Major core score = 0.");
    return { score: 0, matched: 0 };
  }
  const matched = [...requiredMajorCore].filter((code) =>
    completed.has(code)
  ).length;
  return { score: matched / requiredMajorCore.size, matched };
}

/** 3c – Prescribed elective score [weight: 0.20]
 *  If the planner has no prescribed elective categories, the student
 *  has nothing to fulfill - full marks (1.0) are awarded automatically.
 */
function scorePrescribed(
  completed: Set<string>,
  categories: PlannerTemplate["prescribedElectiveCategories"]
): ScoreResult & { possible: number; perCategory: PrescribedCategoryResult[] } {
  if (categories.length === 0) {
    return { score: 1.0, matched: 0, possible: 0, perCategory: [] };
  }

  let totalMatched = 0;
  let totalPossible = 0;
  const perCategory: PrescribedCategoryResult[] = [];

  for (const cat of categories) {
    // Iterate pool (bounded by planner design) and check the completed set O(1) per unit.
    // Avoids spreading the student's full completed set once per category.
    const matchedInCat = Math.min(
      [...cat.pool].filter((c) => completed.has(c)).length,
      cat.slots
    );
    totalMatched += matchedInCat;
    totalPossible += cat.slots;
    perCategory.push({ categoryCode: cat.categoryCode, matched: matchedInCat, slots: cat.slots });
  }

  // All categories have 0 slots -> treat same as no prescribed electives.
  if (totalPossible === 0) {
    return { score: 1.0, matched: 0, possible: 0, perCategory };
  }

  return {
    score: totalMatched / totalPossible,
    matched: totalMatched,
    possible: totalPossible,
    perCategory,
  };
}

/** 3d – Free elective score [weight: 0.05]
 *  Uses WIL-adjusted slot count as denominator.
 *  If adjusted slots reach 0 (WIL exempted all of them), the student
 *  has nothing left to fulfill - full marks (1.0) are awarded automatically.
 */
function scoreFreeElectives(
  completed: Set<string>,
  freeElectivePool: Set<string>,
  slotsRequired: number  // already WIL-adjusted
): ScoreResult {
  // No free elective slots to fill - nothing to fulfill, full score.
  if (slotsRequired === 0) {
    return { score: 1.0, matched: 0 };
  }
  // Iterate pool (bounded by planner) and check the completed set O(1) per unit.
  const inPool = [...freeElectivePool].filter((c) => completed.has(c)).length;
  const matched = Math.min(inPool, slotsRequired);
  return { score: matched / slotsRequired, matched };
}