// ============================================================
// MM-04 – Profile Builder (Phase 2a)
// Enriches a flat normalised unit set into the five categorised
// fields required by Phase 3 scoring.
// Runs once per student before the scoring loop.
// ============================================================

import {
  RawStudentInput,
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

  for (const code of normalisedCodes) {
    const entry = masterMap.get(code);

    if (!entry) {
      // Not in master table – log and skip
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
        // WIL is handled via hasWIL boolean – not added to any unit set
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

  return {
    studentID: raw.studentID,
    intakeYear: raw.intakeYear,
    intakeSemester: raw.intakeSemester,
    completedUnits: normalisedCodes,
    completedCore,
    completedMajorCore,
    completedPrescribed,
    completedFreeElectives,
    electivesByTag,
    hasWIL: raw.hasWIL,
    unclassifiedUnits,
  };
}
