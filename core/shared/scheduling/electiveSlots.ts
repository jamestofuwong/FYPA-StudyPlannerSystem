// A planner records some electives as placeholders: a template_units row with no
// unit_id, saying "an elective goes here" without naming one. The route drops
// those rows when it builds the pool, so without this a plan comes up short of
// the elective requirement. This counts what is missing and picks real units for
// it out of the planner's elective groups.
//
// Pure functions: no database, clock or globals. Nothing here invents a unit
// that is not already on the planner.

import {
  normaliseCode,
  type CustomPlanResult,
  type SchedulableUnit,
} from '../../services/scheduling/customPlannerScheduler';

/** Planner categories that count toward the elective requirement. */
export const ELECTIVE_CATEGORIES: ReadonlyArray<string> = ['elective', 'prescribed_elective'];

export interface ElectiveSlotsNeededInput {
  /** The planner's recorded elective requirement. Null falls back to its empty slots. */
  electiveCount: number | null;
  /** One row per planner template unit. A null unitCode is an empty slot. */
  plannerUnits: { category: string; unitCode: string | null }[];
  /** Every unit code the planner's elective groups offer as a candidate. */
  electiveGroupCodes: string[];
  completedUnitCodes: string[];
  /** The pool as it stands before any recommendation is added to it. */
  pool: { code: string; category: string }[];
  /** Pooled codes the scheduler proved it can never place. See blockedByRequisites. */
  blockedUnitCodes?: string[];
}

// To ignore non-academic training modules
const NON_ACADEMIC_MODULES = new Set(['AIMFECS', 'AIM-FECS', 'AIMSFS', 'AIM-SFS']);

/**
 * How many elective slots still have to be filled.
 *
 * A planner that never recorded an elective_count falls back to its own empty
 * slots, which is what the count would have described.
 */
export function countElectiveSlotsNeeded(input: ElectiveSlotsNeededInput): number {
  const isElective = (category: string) => ELECTIVE_CATEGORIES.includes(category);

  // Helper to determine slot weight: 25 CP = 2 slots, standard 12.5 CP = 1 slot
  function getSlotWeight(unitCode: string, unitDataMap?: Map<string, { creditPoints?: number }>): number {
    const code = normaliseCode(unitCode);
    if (code.includes('ICT20016') && code.includes('OPTIONAL')) return 2;
    const cp = unitDataMap?.get(code)?.creditPoints;
    if (cp && cp >= 25) return Math.round(cp / 12.5);
    return 1;
  }


  if (input.electiveCount == null) {
    return input.plannerUnits.filter((row) => row.unitCode === null && isElective(row.category))
      .length;
  }

  const completed = new Set((input.completedUnitCodes ?? []).map(normaliseCode));
  const blocked = new Set((input.blockedUnitCodes ?? []).map(normaliseCode));

  // Taking an elective from one of the planner's groups is the normal way to do
  // it, so a passed unit counts whether the planner named it or only offered it
  // as a candidate. A set, because a unit can be both.
  // Identify all core / major core codes defined on this planner
  const compulsoryCodes = new Set(
    input.plannerUnits
      .filter((row) => row.unitCode !== null && (row.category === 'core' || row.category === 'major_core'))
      .map((row) => normaliseCode(row.unitCode!))
  );

  // Any completed unit that is NOT core/major_core and NOT mpu counts as an elective
  const completedElectives = new Set<string>();
  for (const code of completed) {
    // Ignore MPU, compulsory units and non-academic training modules
    if (code.startsWith('MPU') || compulsoryCodes.has(code) || NON_ACADEMIC_MODULES.has(code)) {
      continue;
    }
    completedElectives.add(code);
  }

  // Calculate how many elective SLOTS were fulfilled by completed units (25 CP = 2 slots)
  let completedElectiveSlots = 0;
  for (const code of completedElectives) {
    completedElectiveSlots += getSlotWeight(code);
  }

  // Calculate how many elective SLOTS are already occupied in the pool
  const pooledElectives = input.pool
    .filter(
      (unit) =>
        isElective(unit.category) &&
        !(unit.category === 'elective' && blocked.has(normaliseCode(unit.code))),
    )
    .reduce((sum, unit) => sum + getSlotWeight(unit.code), 0);

  // Return remaining slots needed (bounded at 0)
  return Math.max(0, input.electiveCount - completedElectiveSlots - pooledElectives);
}

/**
 * Codes the scheduler left unplaced because of a requisite it can never satisfy.
 *
 * Only requisite_violation counts. A unit held back because it is offered in
 * summer alone, or because the plan ran out of semesters, is still a unit the
 * plan means to include, so those reasons free no slot.
 */
export function blockedByRequisites(result: CustomPlanResult): string[] {
  const violated = new Set(
    result.warnings
      .filter((w) => w.kind === 'requisite_violation')
      .map((w) => normaliseCode(w.unitCode)),
  );
  return result.unschedulableUnits
    .map((unit) => normaliseCode(unit.code))
    .filter((code) => violated.has(code));
}

export interface RecommendElectivesInput {
  /** How many slots are still empty. Zero or less returns nothing. */
  needed: number;
  /** Candidate lists in priority order. Earlier lists are preferred. */
  candidateSources: SchedulableUnit[][];
  completedUnitCodes: string[];
  alreadyPlannedCodes: string[];
  preferredTerm?: 1 | 2;
}

/**
 * Picks up to `needed` units to fill empty elective slots.
 *
 * Sources are consulted in order and an earlier source is exhausted before a
 * later one is touched, so the caller expresses priority by ordering the lists.
 * Within one source: units placeable in a normal semester first, then those
 * whose prerequisites are already met, then source order. Nothing completed or
 * already planned comes back, and no unit comes back twice.
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

    const targetTerm = input.preferredTerm;

    const ranked = candidates
      .map((unit, index) => {
        // Priority: runs in preferred term (0) > runs in any regular term (1) > summer/winter only (2)
        const runsInTarget =
          targetTerm === undefined ||
          unit.offeringSemesters.length === 0 || // unrestricted
          unit.offeringSemesters.includes(targetTerm);

        const offeringScore = runsInTarget
          ? 0
          : offersRegularSemester(unit)
          ? 1
          : 2;

        return {
          unit,
          index,
          offering: offeringScore,
          requisites: requisitesReachable(unit, available) ? 0 : 1,
        };
      })
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

// =============================================================
// Double Major & Sibling Exploration
// =============================================================
export interface SiblingMajorCandidate {
  plannerId: string;
  majorId: string | null;
  majorName: string;
  missingUnits: SchedulableUnit[];
  canFitStrictly: boolean;
}

export function detectSiblingMajorFit(input: {
  freeElectiveSlots: number;
  primaryMajorCodeSet: Set<string>;
  completedUnitCodeSet: Set<string>;
  siblingPlanners: Array<{
    id: string;
    major_id: string | null;
    major_name: string;
    majorCoreUnits: SchedulableUnit[];
  }>;
}): SiblingMajorCandidate[] {
  const { freeElectiveSlots, primaryMajorCodeSet, completedUnitCodeSet, siblingPlanners } = input;

  if (freeElectiveSlots <= 0) return [];

  const results: SiblingMajorCandidate[] = [];

  for (const sibling of siblingPlanners) {
    // Collect major core units from this sibling major that the student has NOT completed and that are NOT already in the primary degree
    const missingUnits = sibling.majorCoreUnits.filter((u) => {
      const code = normaliseCode(u.code);
      return !completedUnitCodeSet.has(code) && !primaryMajorCodeSet.has(code);
    });

    const neededCount = missingUnits.length;
    // Strict Fit Rule: must need at least 1 unit, and all missing units must fit inside free elective slots
    const canFitStrictly = neededCount > 0 && neededCount <= freeElectiveSlots;

    results.push({
      plannerId: sibling.id,
      majorId: sibling.major_id,
      majorName: sibling.major_name,
      missingUnits,
      canFitStrictly,
    });
  }

  // Return feasible double majors sorted by closest fit
  return results.filter((r) => r.canFitStrictly);
}
