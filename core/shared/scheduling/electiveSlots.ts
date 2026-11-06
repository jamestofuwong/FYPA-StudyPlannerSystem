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
  /** Codes that other pooled units need as a prerequisite. See surplusNamedElectives. */
  requiredByOthers?: string[];
}

// To ignore non-academic training modules
const NON_ACADEMIC_MODULES = new Set(['AIMFECS', 'AIM-FECS', 'AIMSFS', 'AIM-SFS']);

// A 25 CP unit fills two slots, a standard 12.5 CP unit one
function slotWeightOf(unitCode: string): number {
  const code = normaliseCode(unitCode);
  if (code.includes('ICT20016') && code.includes('OPTIONAL')) return 2;
  return 1;
}

/**
 * How many elective slots the completed units fill. Any completed unit that is not core, major core, an MPU unit or
 * a non-academic training module counts as an elective: a student may take any unit in an elective slot.
 */
function completedElectiveSlotCount(
  completedUnitCodes: string[],
  plannerUnits: { category: string; unitCode: string | null }[],
): number {
  const compulsoryCodes = new Set(
    plannerUnits
      .filter((row) => row.unitCode !== null && (row.category === 'core' || row.category === 'major_core'))
      .map((row) => normaliseCode(row.unitCode!)),
  );
  const counted = new Set<string>();
  for (const raw of completedUnitCodes ?? []) {
    const code = normaliseCode(raw);
    if (code.startsWith('MPU') || compulsoryCodes.has(code) || NON_ACADEMIC_MODULES.has(code)) continue;
    counted.add(code);
  }
  let slots = 0;
  for (const code of counted) slots += slotWeightOf(code);
  return slots;
}

/**
 * Plain electives that the planner names but the student no longer owes.
 *
 * A plain elective (not a prescribed one) is not compulsory: the student may take any unit in its place. So a unit that
 * the student passed and that is not one of the planner's own electives takes the place of a named one. If the planner
 * says elective A is in this semester and the student took some other unit instead, A is not planned. Which named
 * electives go: the earliest on the planner, because the student's own choices came first in time. A named elective
 * that a requisite blocks goes first of all, since it could not be planned anyway.
 *
 * The passed units can also fill more of the requirement than the planner has named electives for. The extra named
 * ones are then dropped too, so the plan never asks for more electives than the planner needs.
 *
 * Prescribed electives are compulsory and stay. A plain elective that another pooled unit needs as a prerequisite is
 * dropped last. Nothing is dropped when no requirement was recorded.
 *
 * Returns the codes to take out of the pool.
 */
export function surplusNamedElectives(input: ElectiveSlotsNeededInput & { plannedSlots?: Record<string, number | undefined> }): string[] {
  if (input.electiveCount == null) return [];

  const blocked = new Set((input.blockedUnitCodes ?? []).map(normaliseCode));
  const completedSlots = completedElectiveSlotCount(input.completedUnitCodes, input.plannerUnits);

  const prescribedSlots = input.pool
    .filter((unit) => unit.category === 'prescribed_elective')
    .reduce((sum, unit) => sum + slotWeightOf(unit.code), 0);

  const plainAll = input.pool.filter((unit) => unit.category === 'elective');
  const plain = plainAll.filter((unit) => !blocked.has(normaliseCode(unit.code)));
  const plainSlots = plain.reduce((sum, unit) => sum + slotWeightOf(unit.code), 0);
  const blockedSlots = plainAll.reduce((sum, unit) => sum + slotWeightOf(unit.code), 0) - plainSlots;

  // Completed units that are not the planner's own electives: they stand in for named plain electives
  const ownElectives = new Set(
    input.plannerUnits
      .filter((row) => row.unitCode !== null && (row.category === 'elective' || row.category === 'prescribed_elective'))
      .map((row) => normaliseCode(row.unitCode!)),
  );
  const replacementSlots = completedElectiveSlotCount(
    (input.completedUnitCodes ?? []).filter((code) => !ownElectives.has(normaliseCode(code))),
    input.plannerUnits,
  );
  const replaced = Math.min(plainSlots, Math.max(0, replacementSlots - blockedSlots));

  const stillOwed = Math.max(0, input.electiveCount - completedSlots - prescribedSlots);
  const surplus = Math.max(0, plainSlots - stillOwed);

  let toDrop = Math.max(replaced, surplus);
  if (toDrop <= 0) return [];

  const needed = new Set((input.requiredByOthers ?? []).map(normaliseCode));
  const slotOf = (code: string) => input.plannedSlots?.[normaliseCode(code)] ?? Number.MAX_SAFE_INTEGER;
  // earliest planned first, but units that others need as prerequisites are the last to go
  const order = [...plain].sort(
    (a, b) =>
      Number(needed.has(normaliseCode(a.code))) - Number(needed.has(normaliseCode(b.code))) ||
      slotOf(a.code) - slotOf(b.code),
  );

  const drop: string[] = [];
  for (const unit of order) {
    if (toDrop <= 0) break;
    drop.push(unit.code);
    toDrop -= slotWeightOf(unit.code);
  }
  return drop;
}

/**
 * How many elective slots still have to be filled.
 *
 * A planner that never recorded an elective_count falls back to its own empty
 * slots, which is what the count would have described.
 */
export function countElectiveSlotsNeeded(input: ElectiveSlotsNeededInput): number {
  const isElective = (category: string) => ELECTIVE_CATEGORIES.includes(category);

  if (input.electiveCount == null) {
    return input.plannerUnits.filter((row) => row.unitCode === null && isElective(row.category))
      .length;
  }

  const blocked = new Set((input.blockedUnitCodes ?? []).map(normaliseCode));

  // Taking an elective from one of the planner's groups is the normal way to do it, so a passed unit counts whether the
  // planner named it or only offered it as a candidate. Any unit counts: see completedElectiveSlotCount.
  const completedElectiveSlots = completedElectiveSlotCount(input.completedUnitCodes, input.plannerUnits);

  // Calculate how many elective SLOTS are already occupied in the pool
  const pooledElectives = input.pool
    .filter(
      (unit) =>
        isElective(unit.category) &&
        !(unit.category === 'elective' && blocked.has(normaliseCode(unit.code))),
    )
    .reduce((sum, unit) => sum + slotWeightOf(unit.code), 0);

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
        // Check how versatile the elective is:
        // Score 0: Runs in BOTH semesters (unrestricted / 1 and 2)
        // Score 1: Runs in target term
        // Score 2: Runs in single non-target regular term
        // Score 3: Summer/Winter only
        // A unit with no offering data at all is unrestricted. One recorded as
        // summer or winter alone has no semester either, but is not unrestricted:
        // the scheduler can never place it, so it must not rank as versatile.
        const unrestricted = unit.offeringSemesters.length === 0 && offersRegularSemester(unit);

        const isBothSemesters =
          unrestricted ||
          (unit.offeringSemesters.includes(1) && unit.offeringSemesters.includes(2));

        // With no preferred term, any regular semester will do
        const runsInTarget =
          unrestricted ||
          (targetTerm === undefined
            ? unit.offeringSemesters.length > 0
            : unit.offeringSemesters.includes(targetTerm));

        const versatilityScore = isBothSemesters
          ? 0
          : runsInTarget
          ? 1
          : offersRegularSemester(unit)
          ? 2
          : 3;

        return {
          unit,
          index,
          offering: versatilityScore,
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
