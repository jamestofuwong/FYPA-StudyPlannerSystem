// Builds an extended semester-by-semester study plan for
// students who need more time than the standard template.
//
// Rules:
//  - Standard and MPU units per semester are capped (SchedulerConfig)
//  - Requisites must be satisfied before/alongside a unit
//  - A Conceded Pass counts as taken and earns credit, but cannot satisfy a
//    prerequisite or corequisite (Swinburne Conceded Pass form, May 2023)
//  - Units are only placed in semesters they are offered in, per their
//    unit_offerings rows (calendar terms). A unit with no rows is
//    available in any semester.
//  - Only semesters 1 and 2 are scheduled. A unit offered solely in summer
//    or winter is reported, never placed in an ordinary semester.
//
// Pure function: no database, clock or globals. Anything it cannot place is
// returned in unschedulableUnits with a warning saying why.

export interface SchedulerConfig {
  maxStandardPerSemester: number;
  maxMpuPerSemester: number;
  maxSemesters: number;
  creditPointsPerUnit: number;
  /** Per-semester overrides of maxStandardPerSemester, keyed "year-semester", e.g. "3-1": 5 */
  perSemesterOverrides?: Record<string, number>;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxStandardPerSemester: 4,
  maxMpuPerSemester: 1,
  maxSemesters: 20,
  creditPointsPerUnit: 12.5,
};

export interface RequisiteCondition {
  type: 'unit' | 'credit_points';
  /** Only for type === 'unit' */
  requisiteType?: 'prerequisite' | 'corequisite' | 'antirequisite';
  unitCode?: string;
  creditPoints?: number;
}

export interface SchedulableUnit {
  code: string;
  name: string;
  category: string;
  /** The placeable subset of the unit's offering terms. Empty means no restriction. */
  offeringSemesters: (1 | 2)[];
  /**
   * Raw offering terms from unit_offerings, 1-4. Empty means no data recorded.
   * Optional: where a caller omits it, offeringSemesters is the full list.
   */
  allOfferingTerms?: number[];
  /**
   * Only some schemas record credit points per unit. When absent, callers that
   * need a value derive one from the planner's category requirement.
   */
  creditPoints?: number;
  /**
   * Set on units the planner never named, added to fill an empty elective slot.
   * Carried through untouched, so the UI can mark the choice as a recommendation
   * rather than a requirement.
   */
  recommended?: boolean;
  /**
   * Set on units an advisor added from the catalogue rather than the planner.
   * Recorded as an elective, since the planner says nothing about a unit it
   * never listed. Carried through so the UI can mark the row.
   */
  outsidePlanner?: boolean;

  requisiteGroups: RequisiteCondition[][];
}

export interface ScheduledUnit {
  code: string;
  name: string;
  category: string;
  /** Carried from the pool. See SchedulableUnit.recommended. */
  recommended?: boolean;
  /** Carried from the pool. See SchedulableUnit.outsidePlanner. */
  outsidePlanner?: boolean;
}

export interface CustomSemesterBucket {
  year: number;
  semester: 1 | 2;
  units: ScheduledUnit[];
}

export type PlanWarning =
  | {
      kind: 'requisite_violation';
      unitCode: string;
      /** Prerequisite or corequisite codes that were never satisfied. */
      missing: string[];
      /** The subset of missing held only as a Conceded Pass. */
      concededPass?: string[];
      /** Antirequisites already taken, which rule this unit out. */
      conflictsWith?: string[];
      /** Credit points required that the plan can never reach. */
      creditPointsNeeded?: number;
    }
  | { kind: 'not_offered'; unitCode: string; offeringTerms: number[] }
  | { kind: 'no_offering_data'; unitCode: string }
  | { kind: 'short_term_only'; unitCode: string; offeringTerms: number[] }
  | { kind: 'budget_exhausted'; unitCodes: string[] }
  /** limit is the student's normal load: the configured cap, never above the standard full-time load. */
  | { kind: 'over_capacity'; year: number; semester: 1 | 2; count: number; limit: number }
  /** Required units absent from both the plan and the completed list. Validation only. */
  | { kind: 'compulsory_missing'; unitCodes: string[] }
  /** A category short of the credit points the planner requires. Validation only. */
  | { kind: 'requirement_shortfall'; category: string; have: number; need: number }
  /** The same unit sitting in more than one semester. Validation only. */
  | { kind: 'duplicate_placement'; unitCode: string; positions: { year: number; semester: 1 | 2 }[] };

export interface CustomPlanResult {
  semesters: CustomSemesterBucket[];
  /** Kept for compatibility. warnings says why each one was not placed. */
  unschedulableUnits: ScheduledUnit[];
  warnings: PlanWarning[];
}

type ConfigValidation =
  | { ok: true; config: Partial<SchedulerConfig> }
  | { ok: false; error: string };

const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'maxStandardPerSemester',
  'maxMpuPerSemester',
  'maxSemesters',
  'creditPointsPerUnit',
  'perSemesterOverrides',
]);

const MAX_SEMESTERS_LIMIT = 40;
const OVERRIDE_KEY = /^\d{1,4}-[12]$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

/**
 * Checks an untrusted config (e.g. from a request body). Unknown fields are
 * rejected rather than ignored so a typo cannot silently fall back to a default.
 */
export function validateSchedulerConfig(input: unknown): ConfigValidation {
  if (input === undefined || input === null) return { ok: true, config: {} };
  if (!isPlainObject(input)) return { ok: false, error: 'config must be an object' };

  for (const key of Object.keys(input)) {
    if (!CONFIG_KEYS.has(key)) return { ok: false, error: `config.${key} is not a recognised field` };
  }

  const { maxStandardPerSemester, maxMpuPerSemester, maxSemesters, creditPointsPerUnit, perSemesterOverrides } = input;

  if (maxStandardPerSemester !== undefined && !isPositiveInteger(maxStandardPerSemester)) {
    return { ok: false, error: 'config.maxStandardPerSemester must be a positive integer' };
  }
  if (maxMpuPerSemester !== undefined && !isPositiveInteger(maxMpuPerSemester)) {
    return { ok: false, error: 'config.maxMpuPerSemester must be a positive integer' };
  }
  if (
    maxSemesters !== undefined &&
    !(isPositiveInteger(maxSemesters) && maxSemesters <= MAX_SEMESTERS_LIMIT)
  ) {
    return { ok: false, error: `config.maxSemesters must be an integer from 1 to ${MAX_SEMESTERS_LIMIT}` };
  }
  if (
    creditPointsPerUnit !== undefined &&
    !(typeof creditPointsPerUnit === 'number' && Number.isFinite(creditPointsPerUnit) && creditPointsPerUnit > 0)
  ) {
    return { ok: false, error: 'config.creditPointsPerUnit must be a number greater than 0' };
  }
  if (perSemesterOverrides !== undefined) {
    if (!isPlainObject(perSemesterOverrides)) {
      return { ok: false, error: 'config.perSemesterOverrides must be an object' };
    }
    for (const [key, value] of Object.entries(perSemesterOverrides)) {
      if (!OVERRIDE_KEY.test(key)) {
        return { ok: false, error: `config.perSemesterOverrides key "${key}" must be "year-semester", e.g. "3-1"` };
      }
      if (!isPositiveInteger(value)) {
        return { ok: false, error: `config.perSemesterOverrides["${key}"] must be a positive integer` };
      }
    }
  }

  return { ok: true, config: input as Partial<SchedulerConfig> };
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

export function offeringTermsOf(unit: SchedulableUnit): number[] {
  const terms = unit.allOfferingTerms ?? unit.offeringSemesters;
  return [...new Set(terms)].sort((a, b) => a - b);
}

/**
 * Slot semesters count from the student's intake, offering terms are calendar
 * terms. For a September intake the two are swapped. Terms 3 and 4 are never
 * scheduled, so they never reach this.
 */
export function calendarTermFor(slotSemester: 1 | 2, intakeSemester: 1 | 2): 1 | 2 {
  return intakeSemester === 1 ? slotSemester : (slotSemester === 1 ? 2 : 1);
}

export function resolveSchedulerConfig(config: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return { ...DEFAULT_SCHEDULER_CONFIG, ...config };
}

/** The student's normal load: the configured cap, never above the standard full-time load. */
export function normalLoadFor(cfg: SchedulerConfig): number {
  return Math.min(cfg.maxStandardPerSemester, DEFAULT_SCHEDULER_CONFIG.maxStandardPerSemester);
}

/** How many standard units may be placed in one slot, after any per-semester override. */
export function standardLimitFor(cfg: SchedulerConfig, year: number, slotSemester: 1 | 2): number {
  return cfg.perSemesterOverrides?.[`${year}-${slotSemester}`] ?? cfg.maxStandardPerSemester;
}

/** Empty offeringSemesters means unrestricted, so an unknown offering never blocks placement. */
export function isOfferedIn(unit: SchedulableUnit, calendarTerm: 1 | 2): boolean {
  return unit.offeringSemesters.length === 0 || unit.offeringSemesters.includes(calendarTerm);
}

// Raw shape of a unit as returned by Prisma's nested planner/minor includes
// (see web/app/api/custom-planner/route.ts and plannerRepository.getPlannerById()),
// covering only the fields mapUnitToSchedulable reads.
export interface RawSchedulableUnitRow {
  unit_code: string;
  unit_name: string;
  offerings: Array<{ offered_in: number }>;
  requisite_groups: Array<{
    conditions: Array<{
      type: string;
      requisite_type: string | null;
      credit_points: unknown;
      unit: { unit_code: string } | null;
    }>;
  }>;
}

// Converts a raw DB unit row into the SchedulableUnit shape canTake() understands. Extracted from what used
// to be a private toSchedulable() inline in web/app/api/custom-planner/route.ts, so both that route and
// core/services/classEstimation/eligibilityEngine.ts share one mapping instead of two copies drifting apart.
export function mapUnitToSchedulable(unit: RawSchedulableUnitRow, category: string): SchedulableUnit {
  const requisiteGroups: RequisiteCondition[][] = (unit.requisite_groups ?? [])
    .map((group) =>
      group.conditions
        .map((c): RequisiteCondition | null => {
          if (c.type === 'credit_points') {
            return { type: 'credit_points', creditPoints: Number(c.credit_points) };
          }
          if (c.type === 'unit' && c.unit !== null) {
            return {
              type: 'unit',
              requisiteType: (c.requisite_type ?? 'prerequisite') as 'prerequisite' | 'corequisite' | 'antirequisite',
              unitCode: c.unit.unit_code.toUpperCase(),
            };
          }
          return null;
        })
        .filter((c): c is RequisiteCondition => c !== null)
    )
    .filter((g) => g.length > 0);

  // Terms 3 (summer) and 4 (winter) are dropped, since canTake only cycles semesters 1 and 2.
  const offeringSemesters = (unit.offerings ?? [])
    .map((o) => o.offered_in as 1 | 2)
    .filter((sem) => sem === 1 || sem === 2);

  return { code: unit.unit_code, name: unit.unit_name, category, offeringSemesters, requisiteGroups };
}

export function buildCustomPlan(
  remainingUnits: SchedulableUnit[],
  completedUnitCodes: string[],
  startYear: number,
  startSemester: 1 | 2,
  intakeSemester: 1 | 2 = 1,
  concededPassUnitCodes: string[] = [],
  config: Partial<SchedulerConfig> = DEFAULT_SCHEDULER_CONFIG
): CustomPlanResult {
  const cfg: SchedulerConfig = resolveSchedulerConfig(config);
  const normalLoad = normalLoadFor(cfg);

  const concededPass = new Set(concededPassUnitCodes.map(normaliseCode));
  // A Conceded Pass is still a completed unit, even if the caller only listed it once
  const completed = new Set([...completedUnitCodes.map(normaliseCode), ...concededPass]);

  const warnings: PlanWarning[] = [];
  const unplaceable = new Set<SchedulableUnit>();
  const pool: SchedulableUnit[] = [];
  for (const unit of remainingUnits) {
    const terms = offeringTermsOf(unit);
    if (terms.length > 0 && unit.offeringSemesters.length === 0) {
      unplaceable.add(unit);
      warnings.push({ kind: 'short_term_only', unitCode: unit.code, offeringTerms: terms });
    } else {
      pool.push(unit);
    }
  }

  const semesters: CustomSemesterBucket[] = [];

  let currentYear = startYear;
  let currentSem: 1 | 2 = startSemester;
  let consecutiveIdle = 0;
  let blocked = false;

  for (let i = 0; i < cfg.maxSemesters && pool.length > 0; i++) {
    const totalCredits = completed.size * cfg.creditPointsPerUnit;
    const calendarTerm = calendarTermFor(currentSem, intakeSemester);
    const standardLimit = standardLimitFor(cfg, currentYear, currentSem);

    const bucketCodes = new Set<string>();
    const toPlace: SchedulableUnit[] = [];

    // Repeats so a corequisite placed later in the pass can unlock an earlier unit
    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of pool) {
        if (bucketCodes.has(normaliseCode(unit.code))) continue;

        const isMpu = unit.category === 'mpu';
        const standardCount = toPlace.filter((u) => u.category !== 'mpu').length;
        const mpuCount = toPlace.filter((u) => u.category === 'mpu').length;

        if (isMpu && mpuCount >= cfg.maxMpuPerSemester) continue;
        if (!isMpu && standardCount >= standardLimit) continue;

        if (canTake(unit, calendarTerm, completed, concededPass, bucketCodes, totalCredits)) {
          toPlace.push(unit);
          bucketCodes.add(normaliseCode(unit.code));
          changed = true;
        }
      }
    }

    if (toPlace.length === 0) {
      consecutiveIdle++;
      if (consecutiveIdle >= 2) {
        blocked = true;
        break;
      }
    } else {
      consecutiveIdle = 0;
      for (const unit of toPlace) {
        completed.add(normaliseCode(unit.code));
        pool.splice(pool.indexOf(unit), 1);
        if (offeringTermsOf(unit).length === 0) {
          warnings.push({ kind: 'no_offering_data', unitCode: unit.code });
        }
      }
      semesters.push({
        year: currentYear,
        semester: currentSem,
        units: toPlace.map((u) => toScheduled(u)),
      });

      const standardPlaced = toPlace.filter((u) => u.category !== 'mpu').length;
      if (standardPlaced > normalLoad) {
        warnings.push({
          kind: 'over_capacity',
          year: currentYear,
          semester: currentSem,
          count: standardPlaced,
          limit: normalLoad,
        });
      }
    }

    if (currentSem === 1) {
      currentSem = 2;
    } else {
      currentSem = 1;
      currentYear++;
    }
  }

  if (pool.length > 0) {
    const pooledCodes = new Set(pool.map((u) => normaliseCode(u.code)));
    const outOfTime: string[] = [];
    for (const unit of pool) {
      unplaceable.add(unit);
      const reason = explainUnplaced(unit, blocked, completed, concededPass, pooledCodes, cfg.creditPointsPerUnit);
      if (reason) warnings.push(reason);
      else outOfTime.push(unit.code);
    }
    if (outOfTime.length > 0) {
      warnings.push({ kind: 'budget_exhausted', unitCodes: outOfTime });
    }
  }

  return {
    semesters,
    unschedulableUnits: remainingUnits
      .filter((u) => unplaceable.has(u))
      .map((u) => toScheduled(u)),
    warnings,
  };
}

/** Keeps the optional flags out of the result unless they are set. */
function toScheduled(unit: SchedulableUnit): ScheduledUnit {
  return {
    code: unit.code,
    name: unit.name,
    category: unit.category,
    ...(unit.recommended ? { recommended: true } : {}),
    ...(unit.outsidePlanner ? { outsidePlanner: true } : {}),
  };
}

export function canTake(
  unit: SchedulableUnit,
  calendarTerm: 1 | 2,
  completed: Set<string>,
  concededPass: Set<string>,
  bucketCodes: Set<string>,
  totalCredits: number
): boolean {
  if (!isOfferedIn(unit, calendarTerm)) return false;
  if (unit.requisiteGroups.length === 0) return true;
  return unit.requisiteGroups.some((group) =>
    group.every((condition) =>
      isConditionSatisfied(condition, completed, concededPass, bucketCodes, totalCredits)
    )
  );
}

export function isConditionSatisfied(
  condition: RequisiteCondition,
  completed: Set<string>,
  concededPass: Set<string>,
  bucketCodes: Set<string>,
  totalCredits: number
): boolean {
  if (condition.type === 'credit_points') {
    return totalCredits >= (condition.creditPoints ?? 0);
  }

  if (condition.type === 'unit' && condition.unitCode) {
    const code = normaliseCode(condition.unitCode);
    const satisfiesRequisite = completed.has(code) && !concededPass.has(code);
    switch (condition.requisiteType) {
      case 'corequisite':
        return satisfiesRequisite || bucketCodes.has(code);
      case 'antirequisite':
        // A Conceded Pass still counts as having taken the unit
        return !completed.has(code) && !bucketCodes.has(code);
      case 'prerequisite':
      default:
        return satisfiesRequisite;
    }
  }

  return false;
}

type GroupAssessment = {
  impossible: boolean;
  missing: string[];
  concededPass: string[];
  conflictsWith: string[];
  creditPointsNeeded?: number;
  /** Codes still in the unplaced pool that this group waits on. */
  waitingOn: string[];
};

/**
 * Why a unit was left in the pool. Returns null when nothing rules it out,
 * meaning it only ran out of semesters. A condition counts as impossible when
 * nothing left in the plan could ever satisfy it: the required unit is neither
 * completed nor pooled, is held only as a Conceded Pass, an antirequisite is
 * already taken, or the reachable credit total falls short.
 */
function explainUnplaced(
  unit: SchedulableUnit,
  blocked: boolean,
  completed: Set<string>,
  concededPass: Set<string>,
  pooledCodes: Set<string>,
  creditPointsPerUnit: number
): PlanWarning | null {
  const ownCode = normaliseCode(unit.code);
  const reachableCredits = (completed.size + pooledCodes.size - (pooledCodes.has(ownCode) ? 1 : 0)) * creditPointsPerUnit;

  const assessments: GroupAssessment[] = unit.requisiteGroups.map((group) => {
    const a: GroupAssessment = { impossible: false, missing: [], concededPass: [], conflictsWith: [], waitingOn: [] };
    for (const condition of group) {
      if (condition.type === 'credit_points') {
        const needed = condition.creditPoints ?? 0;
        if (reachableCredits < needed) {
          a.impossible = true;
          a.creditPointsNeeded = needed;
        }
        continue;
      }
      if (condition.type !== 'unit' || !condition.unitCode) {
        a.impossible = true;
        continue;
      }
      const code = normaliseCode(condition.unitCode);
      if (condition.requisiteType === 'antirequisite') {
        if (completed.has(code)) {
          a.impossible = true;
          a.conflictsWith.push(code);
        }
        continue;
      }
      if (concededPass.has(code)) {
        a.impossible = true;
        a.missing.push(code);
        a.concededPass.push(code);
      } else if (completed.has(code)) {
        continue;
      } else if (pooledCodes.has(code)) {
        a.waitingOn.push(code);
      } else {
        a.impossible = true;
        a.missing.push(code);
      }
    }
    return a;
  });

  const toWarning = (a: GroupAssessment, missing: string[]): PlanWarning => ({
    kind: 'requisite_violation',
    unitCode: unit.code,
    missing,
    ...(a.concededPass.length > 0 ? { concededPass: a.concededPass } : {}),
    ...(a.conflictsWith.length > 0 ? { conflictsWith: a.conflictsWith } : {}),
    ...(a.creditPointsNeeded !== undefined ? { creditPointsNeeded: a.creditPointsNeeded } : {}),
  });

  const problemSize = (a: GroupAssessment) =>
    a.missing.length + a.conflictsWith.length + (a.creditPointsNeeded !== undefined ? 1 : 0);

  if (assessments.length > 0 && assessments.every((a) => a.impossible)) {
    // Report the alternative closest to being satisfiable
    const best = [...assessments].sort((x, y) => problemSize(x) - problemSize(y))[0];
    return toWarning(best, best.missing);
  }

  if (!blocked) return null;

  // Stalled, but only behind other unplaced units: name the ones it waits on
  const waiting = assessments
    .filter((a) => !a.impossible && a.waitingOn.length > 0)
    .sort((x, y) => x.waitingOn.length - y.waitingOn.length)[0];
  if (waiting) return toWarning(waiting, waiting.waitingOn);

  return { kind: 'not_offered', unitCode: unit.code, offeringTerms: offeringTermsOf(unit) };
}