// ============================================================
// Thin wrapper around eligibilityEngine's forward-looking check, applied to a list of candidate units for
// one student against one target semester. Doesn't cache anything itself, buildEligibilityUnitsFromPlanner()
// already goes through the shared plannerCache.ts, so the expensive database fetch is cached once per
// planner per run regardless of how many times this function is called for that same planner.
// ============================================================

import { buildEligibilityUnitsFromPlanner, isUnitEligible, type EligibilityInput } from './eligibilityEngine';
import type { CandidateUnit } from '../../shared/types/classEstimation';

export async function filterEligibleUnits(
  candidates: CandidateUnit[],
  plannerId: string,
  input: EligibilityInput,
): Promise<CandidateUnit[]> {
  const eligibilityUnits = await buildEligibilityUnitsFromPlanner(plannerId);

  return candidates.filter((candidate) => {
    const unit = eligibilityUnits.get(candidate.code);
    if (!unit) return false; // not part of this planner's known unit set, can't verify offering/requisites
    return isUnitEligible(unit, input);
  });
}
