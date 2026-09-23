// ============================================================
// Shared per-run cache for plannerRepository.getPlannerById(), reused by plannerCandidateResolver.ts,
// eligibilityEngine.ts, and unitRanker.ts, which all need the same matched planner's full nested data
// (TemplateUnit rows, elective_groups, requisites, offerings) for a given student. Without this, the same
// planner would be fetched from the database independently by all three modules, even though many students
// in one estimation run typically share the same matched planner.
// ============================================================

import * as plannerRepository from '../../db/repositories/plannerRepository';

type PlannerWithUnits = Awaited<ReturnType<typeof plannerRepository.getPlannerById>>;

const cache = new Map<string, Promise<PlannerWithUnits>>();

export function getCachedPlannerById(plannerId: string): Promise<PlannerWithUnits> {
  let cached = cache.get(plannerId);
  if (!cached) {
    cached = plannerRepository.getPlannerById(plannerId);
    cache.set(plannerId, cached);
  }
  return cached;
}

// Called once at the start of a fresh estimation run so stale planner data from an earlier run (or from
// planner edits made in between runs) never carries over.
export function resetPlannerCache(): void {
  cache.clear();
}
