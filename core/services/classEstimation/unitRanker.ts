// ============================================================
// Ranks and caps a student's eligible candidate units for the semester being estimated. Core and major core
// units have a real ordering signal, their (year_level, semester) slot on the matched planner's TemplateUnit
// rows, so the earliest-owed units are ranked first and only the top loadCap are kept, everything past the
// cap is dropped for this run rather than carried forward. Prescribed and free elective units are pool-based
// with no slot data at all (see plannerCandidateResolver.ts), so they're not ranked or capped here at all,
// electiveSplitter.ts (Phase 4) handles distributing their remaining slots fractionally across the pool
// instead of picking specific units.
// ============================================================

import { getCachedPlannerById } from './plannerCache';
import type { CandidateUnit, RankedCandidateUnit } from '../../shared/types/classEstimation';

export interface RankedCandidates {
  picked: RankedCandidateUnit[];
  poolCandidates: CandidateUnit[];
}

async function buildSlotLookup(plannerId: string): Promise<Map<string, { yearLevel: number; semester: number }>> {
  const planner = await getCachedPlannerById(plannerId);
  const lookup = new Map<string, { yearLevel: number; semester: number }>();
  if (!planner) return lookup;

  for (const tu of planner.units) {
    if (!tu.unit) continue;
    lookup.set(tu.unit.unit_code, { yearLevel: tu.year_level, semester: tu.semester });
  }
  return lookup;
}

export async function rankAndCapUnits(
  eligible: CandidateUnit[],
  plannerId: string,
  loadCap: number,
): Promise<RankedCandidates> {
  const rankable = eligible.filter((c) => c.category === 'core' || c.category === 'majorCore');
  const poolCandidates = eligible.filter((c) => c.category === 'prescribed' || c.category === 'freeElective');

  const slotByCode = await buildSlotLookup(plannerId);

  // Units with no known slot (shouldn't normally happen for core/majorCore, but handled defensively)
  // sort after every unit that does have one, since there's no ordering signal to place them earlier.
  const ranked: RankedCandidateUnit[] = rankable
    .map((c): RankedCandidateUnit => {
      const slot = slotByCode.get(c.code);
      return { ...c, yearLevel: slot?.yearLevel, semester: slot?.semester };
    })
    .sort((a, b) => {
      const aYear = a.yearLevel ?? Number.MAX_SAFE_INTEGER;
      const bYear = b.yearLevel ?? Number.MAX_SAFE_INTEGER;
      if (aYear !== bYear) return aYear - bYear;
      const aSem = a.semester ?? Number.MAX_SAFE_INTEGER;
      const bSem = b.semester ?? Number.MAX_SAFE_INTEGER;
      return aSem - bSem;
    });

  return { picked: ranked.slice(0, loadCap), poolCandidates };
}
