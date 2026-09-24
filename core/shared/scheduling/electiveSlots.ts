// Chooses units to fill a planner's empty elective slots.
//
// A planner records some electives as placeholders: a template_units row with no
// unit_id, saying "an elective goes here" without naming one. The route drops
// those rows when it builds the pool, so a generated plan came out short of the
// elective requirement. This picks real units for those slots out of the
// planner's elective groups.
//
// Pure function: no database, clock or globals. It only ever returns units it
// was handed, so it can never invent a unit that is not on the planner.

import {
  normaliseCode,
  type SchedulableUnit,
} from '../../services/scheduling/customPlannerScheduler';

export interface RecommendElectivesInput {
  /** How many slots are still empty. Zero or less returns nothing. */
  needed: number;
  /** Candidate lists in priority order. Earlier lists are preferred. */
  candidateSources: SchedulableUnit[][];
  completedUnitCodes: string[];
  alreadyPlannedCodes: string[];
}

/**
 * Picks up to `needed` units to fill empty elective slots.
 *
 * Sources are consulted in order and an earlier source is exhausted before a
 * later one is touched, so the caller expresses priority by ordering the lists.
 * Within one source the order is: units that can be placed in a normal semester
 * first, then units whose prerequisites are already met, then the order the
 * source listed them in. Nothing already completed or already in the plan is
 * returned, and no unit is returned twice.
 *
 * Units come back exactly as they were passed in. Stamping a category or a
 * `recommended` flag is the caller's job, so a caller filling something other
 * than an elective slot can label the result its own way.
 */
export function recommendElectives(input: RecommendElectivesInput): SchedulableUnit[] {
  const needed = Math.floor(input.needed);
  if (!Number.isFinite(needed) || needed <= 0) return [];

  const completed = new Set((input.completedUnitCodes ?? []).map(normaliseCode));
  const planned = new Set((input.alreadyPlannedCodes ?? []).map(normaliseCode));
  // What a prerequisite can be satisfied by: already passed, or already in the
  // pool the scheduler is about to place.
  const available = new Set([...completed, ...planned]);

  // Seeded with both so a completed or planned unit is never offered again.
  const seen = new Set(available);
  const picked: SchedulableUnit[] = [];

  for (const source of input.candidateSources ?? []) {
    if (picked.length >= needed) break;

    const candidates: SchedulableUnit[] = [];
    for (const unit of source ?? []) {
      const code = normaliseCode(unit.code);
      if (seen.has(code)) continue;
      seen.add(code);
      candidates.push(unit);
    }

    const ranked = candidates
      .map((unit, index) => ({
        unit,
        index,
        offering: offersRegularSemester(unit) ? 0 : 1,
        requisites: requisitesReachable(unit, available) ? 0 : 1,
      }))
      .sort(
        (a, b) =>
          a.offering - b.offering || a.requisites - b.requisites || a.index - b.index,
      );

    for (const entry of ranked) {
      if (picked.length >= needed) break;
      picked.push(entry.unit);
    }
  }

  return picked;
}

/**
 * Whether the scheduler could put this unit in semester 1 or 2. A unit with no
 * offering data at all counts as unrestricted, the same way isOfferedIn reads it;
 * only a unit recorded as summer or winter alone is pushed down the list.
 */
function offersRegularSemester(unit: SchedulableUnit): boolean {
  if (unit.offeringSemesters.length > 0) return true;
  return (unit.allOfferingTerms ?? []).length === 0;
}

/**
 * Whether at least one requisite group could be satisfied from what the student
 * has passed plus what the plan already holds. Credit-point conditions are not
 * judged here: how much credit the finished plan carries is not known yet.
 */
function requisitesReachable(unit: SchedulableUnit, available: Set<string>): boolean {
  const groups = unit.requisiteGroups ?? [];
  if (groups.length === 0) return true;

  return groups.some((group) =>
    group.every((condition) => {
      if (condition.type !== 'unit' || !condition.unitCode) return true;
      const code = normaliseCode(condition.unitCode);
      return condition.requisiteType === 'antirequisite'
        ? !available.has(code)
        : available.has(code);
    }),
  );
}