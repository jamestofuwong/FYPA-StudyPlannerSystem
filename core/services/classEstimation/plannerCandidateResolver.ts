// ============================================================
// Turns a completed matching-pipeline run into a list of candidate units a student has not yet taken.
// Core and major core come straight from DisplayPayload's own missingUnits lists, the matching pipeline
// already computed those. Prescribed and free elective are pool-based categories in the matching pipeline's
// own scoring (see plannerTemplateBuilder.ts), DisplayPayload only exposes a missingSlots count for them,
// not which specific units are left, so this resolver pulls the real candidate pool for the matched planner
// straight from the DB (via the same pool helpers plannerTemplateBuilder.ts uses) and subtracts what the
// student has completed. WIL contributes no candidate units at all, it's scored from the student's own
// hasWIL flag, not from planner-specific units.
// ============================================================

import { getCachedPlannerById } from './plannerCache';
import { getPrescribedPoolCodes, getFreeElectivePoolCodes } from '../matching/plannerTemplateBuilder';
import type { MatchingServiceResult } from '../matching/matchingService';
import type { CandidateUnit } from '../../shared/types/classEstimation';

export interface CandidateResolution {
  plannerId: string;
  candidates: CandidateUnit[];
}

// primaryMajor is always rankedPlanners[0] unless a manualOverride was set on the student's RawStudentInput,
// which scrapedStudentMapper.ts never sets for a bulk estimation run, so this lookup is safe here.
export async function resolveCandidateUnits(
  matchResult: MatchingServiceResult,
  completedUnitCodes: string[],
): Promise<CandidateResolution | null> {
  const { payload } = matchResult;
  if (!payload.primaryMajor) return null; // no major detected, nothing to estimate for this student

  const plannerId = payload.rankedPlanners[0]?.plannerID;
  if (!plannerId) return null;

  const planner = await getCachedPlannerById(plannerId);
  if (!planner) return null;

  const completed = new Set(completedUnitCodes.map((code) => code.trim().toUpperCase()));
  const candidates: CandidateUnit[] = [];

  // scoringEngine.ts does subtract completed units from these lists, but it subtracts profile.completedCore
  // and profile.completedMajorCore, which are built by categorising each of the student's units with the ONE
  // global category unitMasterTableBuilder.ts resolved for it across every planner (major_core beats
  // prescribed_elective beats core). A unit that is core in the matched planner but major_core in some other
  // planner therefore lands in completedMajorCore, never in completedCore, so the matched planner's
  // missingCore still lists it even though the student has passed it. Nine of the 65 units in the loaded
  // planners sit in more than one category, COS20007 and COS10003 among them, so this is not a corner case.
  // Filtering against the raw completed set here is category-blind and cannot be fooled that way.
  // The underlying scoring bug is not fixed here, it also depresses matchPct and belongs to /api/match.
  for (const code of payload.primaryMajor.breakdown.core.missingUnits ?? []) {
    if (completed.has(code.trim().toUpperCase())) continue;
    candidates.push({ code, category: 'core' });
  }
  for (const code of payload.primaryMajor.breakdown.majorCore.missingUnits ?? []) {
    if (completed.has(code.trim().toUpperCase())) continue;
    candidates.push({ code, category: 'majorCore' });
  }

  const prescribedSlots = payload.primaryMajor.breakdown.prescribed.missingSlots ?? 0;
  if (prescribedSlots > 0) {
    for (const code of new Set(getPrescribedPoolCodes(planner))) {
      if (completed.has(code)) continue;
      candidates.push({ code, category: 'prescribed', poolSlotsRemaining: prescribedSlots });
    }
  }

  const freeElectiveSlots = payload.primaryMajor.breakdown.freeElective.missingSlots ?? 0;
  if (freeElectiveSlots > 0) {
    for (const code of new Set(getFreeElectivePoolCodes(planner))) {
      if (completed.has(code)) continue;
      candidates.push({ code, category: 'freeElective', poolSlotsRemaining: freeElectiveSlots });
    }
  }

  return { plannerId, candidates };
}
