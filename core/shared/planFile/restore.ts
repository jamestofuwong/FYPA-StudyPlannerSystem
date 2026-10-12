import { normaliseCode } from '../../services/scheduling/customPlannerScheduler';
import type { CustomSemesterBucket, SchedulableUnit, ScheduledUnit } from '../../services/scheduling/customPlannerScheduler';
import type { PlanPayload } from './index';

/**
 * Everything the overlay needs to turn a payload's bare (code, category,
 * position) arrangement back into full ScheduledUnit objects: the freshly
 * generated response's own pools, plus the resolve endpoint's outside-planner
 * units. Never the file's own say on a unit's name or offerings.
 */
export interface RestoreLookupSources {
  units: SchedulableUnit[];
  mpuUnits: SchedulableUnit[];
  electiveCandidates: SchedulableUnit[];
  completedUnits: SchedulableUnit[];
  outsidePlannerUnits: SchedulableUnit[];
}

export interface RestoreSkippedUnit {
  code: string;
  reason: string;
}

export interface OverlaidPlan {
  semesters: CustomSemesterBucket[];
  restoredUnitCount: number;
  restoredSemesterCount: number;
  skipped: RestoreSkippedUnit[];
}

/**
 * Rebuilds customPlan.semesters from a payload's saved arrangement, looking
 * up each unit's full data (name, offerings, requisites) from the freshly
 * generated response by code; the file itself only ever supplies code,
 * category, position and the four flags. A code that resolves against
 * nothing available (removed from the catalogue since export, a typo in a
 * hand-edited file) is dropped and reported, never silently invented.
 */
export function overlayRestoredArrangement(payload: PlanPayload, sources: RestoreLookupSources): OverlaidPlan {
  const lookup = new Map<string, SchedulableUnit>();
  for (const u of [
    ...sources.electiveCandidates,
    ...sources.units,
    ...sources.mpuUnits,
    ...sources.completedUnits,
    ...sources.outsidePlannerUnits,
  ]) {
    const code = normaliseCode(u.code);
    if (!lookup.has(code)) lookup.set(code, u);
  }

  const bySlot = new Map<string, { year: number; semester: 1 | 2; entries: PlanPayload['arrangement'] }>();
  for (const entry of payload.arrangement) {
    const slotKey = `${entry.year}-${entry.semester}`;
    if (!bySlot.has(slotKey)) bySlot.set(slotKey, { year: entry.year, semester: entry.semester, entries: [] });
    bySlot.get(slotKey)!.entries.push(entry);
  }

  const skipped: RestoreSkippedUnit[] = [];
  let restoredUnitCount = 0;
  const semesters: CustomSemesterBucket[] = [];

  for (const { year, semester, entries } of bySlot.values()) {
    const units: ScheduledUnit[] = [];
    for (const entry of [...entries].sort((a, b) => a.position - b.position)) {
      const found = lookup.get(normaliseCode(entry.code));
      if (!found) {
        skipped.push({ code: entry.code, reason: 'no longer exists in the catalogue or this planner' });
        continue;
      }
      units.push({
        code: found.code,
        name: found.name,
        category: entry.category,
        ...(entry.recommended ? { recommended: true } : {}),
        ...(entry.outsidePlanner ? { outsidePlanner: true } : {}),
      });
      restoredUnitCount++;
    }
    semesters.push({ year, semester, units });
  }

  semesters.sort((a, b) => a.year - b.year || a.semester - b.semester);

  return { semesters, restoredUnitCount, restoredSemesterCount: semesters.length, skipped };
}
