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
} from "../../shared/types/matching";

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
  student: RawStudentInput & { manualOverride?: string },
  evidence?: ReadonlyMap<string, number>
): DetectionResult {
  // Phase 4 - rank by majorCoreScore, tiebreak by matchPct
  const ranked = mergeSort(scoreRecords);

  // Phase 5 - detection logic
  return assignMajors(ranked, config, student.manualOverride, evidence);
}

// --- Phase 4 - Ranking -------------------------------

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

// --- Phase 5 - Major Detection -------------------------------

function assignMajors(
  ranked: PlannerScoreRecord[],
  config: AlgorithmConfig,
  manualOverride?: string,
  evidence?: ReadonlyMap<string, number>
): DetectionResult {
  // Empty list edge case
  if (ranked.length === 0) {
    return {
      primaryMajor: null,
      secondMajor: null,
      status: "noMajorDetected",
      rankedPlanners: []
    };
  }

  const rank1 = ranked[0];

  // No major detected: rank-1 matchPct is below noMajorThreshold
  if (rank1.matchPct / 100 < config.noMajorThreshold) {
    return {
      primaryMajor: null,
      secondMajor: null,
      status: "noMajorDetected",
      rankedPlanners: ranked,
    };
  }

  // No evidence: the top-ranked major has no unit that points to it and to no other major (see majorEvidence).
  // A manual override is the advisor's decision, so it is never second-guessed here.
  if (!manualOverride && evidence && (evidence.get(rank1.majorName) ?? 0) === 0) {
    return {
      primaryMajor: null,
      secondMajor: null,
      status: "noMajorDetected",
      rankedPlanners: ranked,
    };
  }

  // Manual override: show override name in display but preserve algorithm result
  const overrideTarget = manualOverride ? ranked.find((r) => r.plannerID === manualOverride) : undefined;
  if (manualOverride && !overrideTarget) {
    console.warn(
      `[MajorDetector] Override plannerID="${manualOverride}" not found in ranked results. ` +
      `Falling back to algorithm result.`
    );
  }
  const primary = overrideTarget ?? rank1;

  // Second major: the best-ranked planner of a different major that meets secondMajorThreshold. Plain rank 2
  // could be the overridden primary itself, or another intake version of the primary's own major.
  const next = ranked.find((r) => r.majorName !== primary.majorName);
  const secondMajor = next && next.matchPct / 100 >= config.secondMajorThreshold ? next : null;

  if (overrideTarget) {
    return {
      primaryMajor: overrideTarget,
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
