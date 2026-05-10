// ============================================================
// MM-04 – Profile Builder (Phase 2a)
// Enriches a flat normalised unit set into categorised fields.
// Also checks requisites and logs violations as RequisiteFlags
// ============================================================

import {
  RawStudentInput,
  RequisiteFlag,
  StudentProfile,
  UnitMasterEntry,
} from "../../shared/types/matching";

/**
 * buildStudentProfile
 *
 * Looks up each normalised unit code in the master table and
 * classifies it into the correct category set.
 * Also populates electivesByTag for minor detection (Phase 7).
 * Units not found in the master table are logged as unclassified
 * and excluded from all scoring sets.
 */
export function buildStudentProfile(
  raw: RawStudentInput,
  normalisedCodes: Set<string>,
  unitMasterTable: UnitMasterEntry[]
): StudentProfile {
  // Build a lookup map from the master table (code -> entry)
  const masterMap = new Map<string, UnitMasterEntry>();
  for (const entry of unitMasterTable) {
    masterMap.set(entry.code, entry);
  }

  const completedCore = new Set<string>();
  const completedMajorCore = new Set<string>();
  const completedPrescribed = new Set<string>();
  const completedFreeElectives = new Set<string>();
  const electivesByTag = new Map<string, Set<string>>();
  const unclassifiedUnits: string[] = [];

  // Classify each completed unit into the appropriate category set
  for (const code of normalisedCodes) {
    const entry = masterMap.get(code);

    if (!entry) {
      // Not in master table - log and skip
      unclassifiedUnits.push(code);
      console.warn(`[ProfileBuilder] Unit not found in master table, excluded from scoring: ${code}`);
      continue;
    }

    // Classify into category sets
    switch (entry.category) {
      case "core":
        completedCore.add(code);
        break;
      case "majorCore":
        completedMajorCore.add(code);
        break;
      case "prescribed":
        completedPrescribed.add(code);
        break;
      case "freeElective":
        completedFreeElectives.add(code);
        break;
      case "WIL":
        // WIL is handled via hasWIL boolean - not added to any unit set
        break;
    }

    // Populate electivesByTag for minor detection (Phase 7)
    // Only elective units (prescribed + free) carry subject tags
    if (entry.category === "prescribed" || entry.category === "freeElective") {
      for (const tag of entry.subjectTags) {
        if (!electivesByTag.has(tag)) {
          electivesByTag.set(tag, new Set<string>());
        }
        electivesByTag.get(tag)!.add(code);
      }
    }
  }

  if (unclassifiedUnits.length > 0) {
    console.warn(
      `[ProfileBuilder] Student ${raw.studentID}: ` +
      `${unclassifiedUnits.length} unit(s) unclassified and excluded from scoring: ` +
      unclassifiedUnits.join(", ")
    );
  }

  // Requisite checking
  const requisiteFlags = checkRequisites(normalisedCodes, masterMap);

  return {
    studentID: raw.studentID,
    courseType: raw.courseType,
    intakeYear: raw.intakeYear,
    intakeSemester: raw.intakeSemester,
    currentSemester: raw.currentSemester,
    completedUnits: normalisedCodes,
    completedCore,
    completedMajorCore,
    completedPrescribed,
    completedFreeElectives,
    electivesByTag,
    hasWIL: raw.hasWIL,
    unclassifiedUnits,
    requisiteFlags,
  };
}

// --- Requisite Checker ------------------------------------------------
 
/**
 * checkRequisites
 *
 * Iterates every completed unit and checks its requisites against
 * the student's completed set. Returns a list of RequisiteFlags
 * for any violations found.
 *
 * Prerequisite:   the required unit is NOT in completedUnits -> flag
 * Concurrent:     the required unit is NOT in completedUnits -> flag
 *                 (concurrent means taken at the same time or before)
 * Anti-requisite: the conflicting unit IS in completedUnits -> flag
 *
 * Flags are informational - they do not remove units from scoring.
 * The dashboard surfaces them to the HOD for review.
 */

function checkRequisites(
  completedUnits: Set<string>,
  masterMap: Map<string, UnitMasterEntry>
): RequisiteFlag[] {
  const flags: RequisiteFlag[] = [];
 
  for (const code of completedUnits) {
    const entry = masterMap.get(code);
    if (!entry) continue;
 
    for (const req of entry.requisites) {
      switch (req.type) {
        case "prerequisite":
          if (!completedUnits.has(req.unitCode)) {
            flags.push({
              unitCode: code,
              requisiteType: "prerequisite",
              relatedUnit: req.unitCode,
              issue: `${code} requires ${req.unitCode} as a prerequisite, which has not been completed.`,
            });
          }
          break;
 
        case "concurrent":
          if (!completedUnits.has(req.unitCode)) {
            flags.push({
              unitCode: code,
              requisiteType: "concurrent",
              relatedUnit: req.unitCode,
              issue: `${code} requires ${req.unitCode} to be taken concurrently or before, which has not been completed.`,
            });
          }
          break;
 
        case "antirequisite":
          if (completedUnits.has(req.unitCode)) {
            flags.push({
              unitCode: code,
              requisiteType: "antirequisite",
              relatedUnit: req.unitCode,
              issue: `${code} and ${req.unitCode} are anti-requisites - both cannot be counted.`,
            });
          }
          break;
      }
    }
  }
 
  return flags;
}