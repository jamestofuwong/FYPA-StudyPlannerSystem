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
  StudentProfile,
  UnavailableUnit,
  UnitMasterEntry,
} from "../../shared/types/matching";

/**
 * buildDisplayPayload
 *
 * Converts a DetectionResult into the DisplayPayload consumed
 * by the dashboard (REQ-FUN-606, REQ-FUN-607).
 */
export function buildDisplayPayload(
  profile: StudentProfile,
  result: DetectionResult,
  unitMasterTable: UnitMasterEntry[]
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
  
  // Build unavailable units list from the primary major's missing units
  const unavailableUnits = primaryMajor
    ? buildUnavailableUnits(
        [
          ...result.primaryMajor!.missingCore,
          ...result.primaryMajor!.missingMajorCore,
        ],
        profile.currentSemester,
        unitMasterTable
      )
    : [];

  return {
    studentID: profile.studentID,
    courseType: profile.courseType,
    status: result.status,
    isOverride,
    primaryMajor,
    detectedPrimary,
    secondMajor,
    topAlternatives,
    detectedMinors: [], // populated by Phase 7 (MM-09)
    rankedPlanners: result.rankedPlanners,
    unavailableUnits,
  };
}

// --- Helpers ------------------------------------------------

/**
 * toMajorDisplay
 *
 * Converts a PlannerScoreRecord into a MajorDisplay with per-category
 * breakdown for the dashboard.
 */
function toMajorDisplay(record: PlannerScoreRecord): MajorDisplay {
  return {
    majorName: record.majorName,
    courseType: record.courseType,
    plannerVersion: {
      intakeYear: record.intakeYear,
      intakeSemester: record.intakeSemester,
    },
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
    requisiteFlags: record.requisiteFlags,
  };
}

/**
 * buildUnavailableUnits
 *
 * Cross-references missing unit codes against the unit master table
 * to find units that are not offered in the student's current semester.
 * These are surfaced separately so the dashboard can warn the advisor.
 */
function buildUnavailableUnits(
  missingCodes: string[],
  currentSemester: 1 | 2,
  unitMasterTable: UnitMasterEntry[]
): UnavailableUnit[] {
  const masterMap = new Map(unitMasterTable.map((u) => [u.code, u]));
 
  return missingCodes
    .map((code) => masterMap.get(code))
    .filter((entry): entry is UnitMasterEntry =>
      entry !== undefined &&
      !( entry.offeringSemesters ?? [] ).includes(currentSemester)
    )
    .map((entry) => ({
      unitCode: entry.code,
      unitName: entry.name,
      availableInSemesters: entry.offeringSemesters ?? [],
    }));
}
