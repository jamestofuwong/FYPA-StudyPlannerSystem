// ============================================================
// MM-08 – Output Packager (Phase 6)
// Assembles DisplayPayload from DetectionResult.
// No computation here — purely structures the result for the
// dashboard layer.
// ============================================================

import {
  CategoryBreakdown,
  DetectionResult,
  DisplayPayload,
  MajorDisplay,
  PlannerScoreRecord,
} from "../../types/matching";

/**
 * buildDisplayPayload
 *
 * Converts a DetectionResult into the DisplayPayload consumed
 * by the dashboard (REQ-FUN-606, REQ-FUN-607).
 */
export function buildDisplayPayload(
  studentID: string,
  result: DetectionResult
): DisplayPayload {
  const isOverride = result.status === "overridden";

  const primaryMajor = result.primaryMajor
    ? toMajorDisplay(result.primaryMajor)
    : null;

  const secondMajor = result.secondMajor
    ? toMajorDisplay(result.secondMajor)
    : null;

  // When override is active, preserve the algorithm's detected result separately
  const detectedPrimary =
    isOverride && result.algorithmPrimary
      ? toMajorDisplay(result.algorithmPrimary)
      : undefined;

  // Top-3 alternatives for the noMajorDetected surface
  const topAlternatives =
    result.status === "noMajorDetected"
      ? result.rankedPlanners.slice(0, 3).map(toMajorDisplay)
      : [];

  return {
    studentID,
    status: result.status,
    isOverride,
    primaryMajor,
    detectedPrimary,
    secondMajor,
    topAlternatives,
    detectedMinors: [], // populated by Phase 7 (MM-09)
    rankedPlanners: result.rankedPlanners,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * toMajorDisplay
 *
 * Converts a PlannerScoreRecord into a MajorDisplay with per-category
 * breakdown for the dashboard.
 */
function toMajorDisplay(record: PlannerScoreRecord): MajorDisplay {
  return {
    majorName: record.majorName,
    matchPct: record.matchPct,
    majorCoreScore: record.majorCoreScore,
    breakdown: {
      core: {
        matched: record.coreMatched,
        required: record.coreRequired,
        missingUnits: record.missingCore,
      } satisfies CategoryBreakdown,
      majorCore: {
        matched: record.majorCoreMatched,
        required: record.majorCoreRequired,
        missingUnits: record.missingMajorCore,
      } satisfies CategoryBreakdown,
      prescribed: {
        matched: record.prescribedMatched,
        required: record.prescribedPossible,
        missingSlots: record.missingPrescribed.reduce(
          (sum, cat) => sum + cat.unfilledSlots,
          0
        ),
      } satisfies CategoryBreakdown,
      freeElective: {
        matched: record.freeMatched,
        required: record.freePossible,
        missingSlots: record.missingFreeSlots,
      } satisfies CategoryBreakdown,
      wil: {
        matched: record.wilScore,
        required: 1,
      } satisfies CategoryBreakdown,
    },
  };
}