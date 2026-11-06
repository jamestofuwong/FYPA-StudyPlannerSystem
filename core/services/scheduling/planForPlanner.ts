// Builds a student's remaining plan from a planner, the way the advisor's
// Student Pathway does it, so any app that holds a planner and a list of
// completed units gets the same plan.
//
// Pure functions: no database, clock or globals. Callers load their own rows,
// map them with unitRowToSchedulable, and hand the result in.
//
// The work is split in two because the advisor has to look at the free elective
// slots between the halves: sibling majors and minors are offered according to
// how many slots are free, and what the student picks takes slots from the
// electives that would otherwise be recommended.
//
//   startPlanForPlanner  builds the pool and counts the free elective slots
//   finishPlanForPlanner swaps in a double major or minor, recommends electives
//                        for what is left, and schedules the final plan

import {
  buildCustomPlan,
  calendarTermFor,
  normaliseCode,
  type CustomPlanResult,
  type SchedulableUnit,
  type SchedulerConfig,
} from './customPlannerScheduler';
import {
  blockedByRequisites,
  countElectiveSlotsNeeded,
  recommendElectives,
  surplusNamedElectives,
} from '../../shared/scheduling/electiveSlots';

export interface PlannerPlanInput {
  /**
   * Every row on the planner. A null unit is an empty slot, an elective with no unit named. The year and
   * semester are where the planner puts the row; with them the plan follows the planner's order, without
   * them it is just the fastest plan.
   */
  plannerUnits: { category: string; unit: SchedulableUnit | null; yearLevel?: number; semester?: number }[];
  /** The planner's recorded elective requirement. Null falls back to its empty slots. */
  electiveCount: number | null;
  /** The planner's elective groups, one list of candidates per group. */
  electiveGroups: SchedulableUnit[][];
  completedUnitCodes: string[];
  concededPassUnitCodes?: string[];
  startYear: number;
  startSemester: 1 | 2;
  /** The semester the planner's own intake falls in, 1 for Feb/Mar and 2 for Aug/Sep. */
  intakeSemester: 1 | 2;
  config?: Partial<SchedulerConfig>;
  /**
   * Whether MPU units the student still owes go into the plan. The advisor
   * leaves them out and handles them in a section of their own, where an advisor
   * can pick between alternatives. An app with no such section needs them in the plan
   * or they would not appear at all.
   */
  scheduleMpu?: boolean;
}

export interface PlannerPlanStart {
  /** Planner units still owed, mapped for the scheduler. */
  pool: SchedulableUnit[];
  completedCodes: Set<string>;
  /** The plan as it stands before electives or a double major, used only to learn what is blocked. */
  probe: CustomPlanResult;
  /** Elective slots the student still owes, before a double major or minor takes any. */
  freeElectiveSlots: number;
  /**
   * Plain electives that the planner names but the student no longer owes, because other units they passed already fill
   * the elective requirement. They are not in the pool.
   */
  droppedElectives: string[];
}

export interface PlannerPlanFinish {
  result: CustomPlanResult;
  /** Everything handed to the scheduler: the pool, swapped units and recommended electives. */
  units: SchedulableUnit[];
  /** How many slots the swapped units took. */
  slotsTaken: number;
  /** The recommended electives added for the slots that were left. */
  recommended: SchedulableUnit[];
}

/**
 * Where the planner puts a row, as semesters after the intake (0 = the first semester). Summer and winter
 * placements are not regular semesters, so they have no slot.
 */
export function plannedSlotOf(row: { yearLevel?: number; semester?: number }): number | undefined {
  const { yearLevel, semester } = row;
  if (yearLevel === undefined || (semester !== 1 && semester !== 2)) return undefined;
  return (yearLevel - 1) * 2 + (semester - 1);
}

function schedule(input: PlannerPlanInput, pool: SchedulableUnit[]): CustomPlanResult {
  return buildCustomPlan(
    pool,
    input.completedUnitCodes,
    input.startYear,
    input.startSemester,
    input.intakeSemester,
    input.concededPassUnitCodes ?? [],
    input.config,
  );
}

/** Codes that some other unit in the list needs as a prerequisite (a corequisite is not counted, it can sit beside). */
function prerequisiteCodesOf(units: SchedulableUnit[]): string[] {
  const codes = new Set<string>();
  for (const unit of units) {
    for (const group of unit.requisiteGroups ?? []) {
      for (const condition of group) {
        if (condition.type === 'unit' && condition.unitCode && (condition.requisiteType ?? 'prerequisite') === 'prerequisite') {
          codes.add(normaliseCode(condition.unitCode));
        }
      }
    }
  }
  return [...codes];
}

export function startPlanForPlanner(input: PlannerPlanInput): PlannerPlanStart {
  const completedCodes = new Set(input.completedUnitCodes.map((code) => code.trim().toUpperCase()));

  const pool: SchedulableUnit[] = [];
  for (const row of input.plannerUnits) {
    if (!row.unit) continue;
    if (row.category === 'mpu' && !input.scheduleMpu) continue;
    if (completedCodes.has(row.unit.code.trim().toUpperCase())) continue;
    const plannedSlot = plannedSlotOf(row);
    pool.push(plannedSlot === undefined ? row.unit : { ...row.unit, plannedSlot });
  }

  // The pool is scheduled twice on purpose. Whether an elective already in the
  // pool fills its slot is only knowable after a run, since one blocked by a
  // requisite is never placed and leaves its slot to a recommendation. This run
  // answers that and is discarded; finishPlanForPlanner makes the plan returned.
  const probe = schedule(input, pool);

  const slotInput = {
    electiveCount: input.electiveCount,
    plannerUnits: input.plannerUnits.map((row) => ({
      category: row.category,
      unitCode: row.unit?.code ?? null,
    })),
    electiveGroupCodes: input.electiveGroups.flat().map((unit) => unit.code),
    completedUnitCodes: [...completedCodes],
    blockedUnitCodes: blockedByRequisites(probe),
  };

  // A plain elective is not compulsory. The student may have passed other units in its place, so what the planner
  // names can be more than what is still owed: the surplus is not planned.
  const requiredByOthers = prerequisiteCodesOf(pool);
  const plannedSlots: Record<string, number | undefined> = {};
  for (const unit of pool) plannedSlots[normaliseCode(unit.code)] = unit.plannedSlot;
  const dropped = new Set(
    surplusNamedElectives({ ...slotInput, pool, plannedSlots, requiredByOthers }).map(normaliseCode),
  );
  const kept = pool.filter((unit) => !dropped.has(normaliseCode(unit.code)));

  const freeElectiveSlots = countElectiveSlotsNeeded({ ...slotInput, pool: kept });

  return { pool: kept, completedCodes, probe, freeElectiveSlots, droppedElectives: pool.filter((u) => dropped.has(normaliseCode(u.code))).map((u) => u.code) };
}

export function finishPlanForPlanner(
  input: PlannerPlanInput,
  start: PlannerPlanStart,
  /**
   * Units from a double major or minor the student chose, in priority order and
   * already marked with their category. They stand in for elective slots.
   */
  swapped: SchedulableUnit[] = [],
  /**
   * Units that the student needs on top of the planner and that did not fit in a free elective slot, for example the
   * rest of a second major. They take no slot. They are planned after the planner's own units, which can make the
   * plan longer than the planner.
   */
  additional: SchedulableUnit[] = [],
): PlannerPlanFinish {
  const units = [...start.pool];

  // Never let swapped units take more than the slots there are. A unit already
  // in the pool is not added twice, but still uses up a slot.
  const unique = new Map<string, SchedulableUnit>();
  for (const unit of swapped) {
    const code = normaliseCode(unit.code);
    if (!unique.has(code)) unique.set(code, { ...unit, recommended: true });
  }
  let slotsTaken = 0;
  for (const [code, unit] of unique) {
    if (slotsTaken >= start.freeElectiveSlots) break;
    if (!units.some((u) => normaliseCode(u.code) === code)) units.push(unit);
    slotsTaken++;
  }

  // Units that need no slot are added as they are, once each
  for (const unit of additional) {
    const code = normaliseCode(unit.code);
    if (start.completedCodes.has(code) || units.some((u) => normaliseCode(u.code) === code)) continue;
    units.push({ ...unit, recommended: true });
  }

  // Whatever the swapped units left free is filled from the planner's own groups
  const slotsLeft = Math.max(0, start.freeElectiveSlots - slotsTaken);
  const picked =
    slotsLeft > 0
      ? recommendElectives({
          needed: slotsLeft,
          preferredTerm: calendarTermFor(input.startSemester, input.intakeSemester),
          candidateSources: input.electiveGroups,
          completedUnitCodes: [...start.completedCodes],
          alreadyPlannedCodes: units.map((u) => u.code),
        })
      : [];
  // The planner's empty elective slots are where these belong. Slots fill in planner order, so the ones still
  // open are the latest.
  const openSlots = input.plannerUnits
    .filter((row) => row.unit === null)
    .map(plannedSlotOf)
    .filter((slot): slot is number => slot !== undefined)
    .sort((a, b) => a - b)
    .slice(-picked.length || undefined);
  const recommended = picked.map((unit, i) => ({
    ...unit,
    category: 'elective',
    recommended: true,
    ...(picked.length > 0 && openSlots[i] !== undefined ? { plannedSlot: openSlots[i] } : {}),
  }));
  units.push(...recommended);

  return { result: schedule(input, units), units, slotsTaken, recommended };
}
