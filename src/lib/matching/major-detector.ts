// ============================================================
// MM-07 – Major Detector (Phases 4 + 5)
// Phase 4: Rank planners by majorCoreScore (merge sort)
// Phase 5: Assign primary major, second major, handle edge cases
// ============================================================

import {
  AlgorithmConfig,
  DetectionResult,
  PlannerScoreRecord,
  RawStudentInput,
} from "../../types/matching";

/**
 * detectMajors
 *
 * Entry point for Phases 4 and 5.
 * Takes the unsorted score records from Phase 3 and returns a
 * DetectionResult with primary major, second major, and ranked list.
 */
export function detectMajors(
  scoreRecords: PlannerScoreRecord[],
  config: AlgorithmConfig,
  student: RawStudentInput & { manualOverride?: string }
): DetectionResult {
  // Phase 4 - rank by majorCoreScore, tiebreak by matchPct
  const ranked = mergeSort(scoreRecords);

  // Phase 5 - detection logic
  return assignMajors(ranked, config, student.manualOverride);
}

// ─── Phase 4 - Ranking ────────────────────────────────────────────────────────

/**
 * mergeSort
 *
 * Stable O(n log n) sort descending by majorCoreScore.
 * Where majorCoreScore is equal, matchPct is the tiebreaker.
 * Merge sort chosen for stable, deterministic behaviour per the spec.
 */
export function mergeSort(records: PlannerScoreRecord[]): PlannerScoreRecord[] {
  if (records.length <= 1) return records;

  const mid = Math.floor(records.length / 2);
  const left = mergeSort(records.slice(0, mid));
  const right = mergeSort(records.slice(mid));

  return merge(left, right);
}

function merge(
  left: PlannerScoreRecord[],
  right: PlannerScoreRecord[]
): PlannerScoreRecord[] {
  const result: PlannerScoreRecord[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }

  return [...result, ...left.slice(i), ...right.slice(j)];
}

/**
 * compare
 *
 * Returns negative if a should come before b (a ranks higher).
 * Primary: majorCoreScore descending.
 * Tiebreaker: matchPct descending.
 */
function compare(a: PlannerScoreRecord, b: PlannerScoreRecord): number {
  if (b.majorCoreScore !== a.majorCoreScore) {
    return b.majorCoreScore - a.majorCoreScore;
  }
  return b.matchPct - a.matchPct;
}

// ─── Phase 5 - Major Detection ────────────────────────────────────────────────

function assignMajors(
  ranked: PlannerScoreRecord[],
  config: AlgorithmConfig,
  manualOverride?: string
): DetectionResult {
  // Empty list edge case
  if (ranked.length === 0) {
    return {
      primaryMajor: null,
      secondMajor: null,
      status: "noMajorDetected",
      rankedPlanners: [],
      manualOverride,
    };
  }

  const rank1 = ranked[0];
  const rank2 = ranked[1] ?? null;

  // No major detected: rank-1 matchPct is below noMajorThreshold
  if (rank1.matchPct / 100 < config.noMajorThreshold) {
    return {
      primaryMajor: null,
      secondMajor: null,
      status: "noMajorDetected",
      rankedPlanners: ranked,
      manualOverride,
    };
  }

  // Second major: rank-2 exists and its matchPct meets secondMajorThreshold
  const secondMajor =
    rank2 && rank2.matchPct / 100 >= config.secondMajorThreshold
      ? rank2
      : null;

  // Manual override: show override name in display but preserve algorithm result
  if (manualOverride) {
    return {
      primaryMajor: rank1,
      secondMajor,
      status: "overridden",
      rankedPlanners: ranked,
      manualOverride,
      algorithmPrimary: rank1,
    };
  }

  return {
    primaryMajor: rank1,
    secondMajor,
    status: "detected",
    rankedPlanners: ranked,
  };
}