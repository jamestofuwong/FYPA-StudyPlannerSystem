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

  // Core and major core missingUnits are already filtered against completed units by scoringEngine.ts,
  // no need to re-filter here.
  for (const code of payload.primaryMajor.breakdown.core.missingUnits ?? []) {
    candidates.push({ code, category: 'core' });
  }
  for (const code of payload.primaryMajor.breakdown.majorCore.missingUnits ?? []) {
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
