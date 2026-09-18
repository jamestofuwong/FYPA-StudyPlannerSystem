// Checks a plan somebody else arranged, rather than building one.
//
// buildCustomPlan only ever places a unit where it is already legal, so it
// cannot judge an advisor's or a student's edits. This walks a finished plan and
// reports what is wrong with it, reusing the scheduler's own rules so the
// generator and the validator can never disagree.
//
// Pure function: no database, clock or globals. It never modifies the plan and
// never throws on a violation. An advisor overriding a requisite is a legitimate
// act, so the job here is to make it visible, the same way over_capacity warns
// rather than refusing.

import {
  calendarTermFor,
  isConditionSatisfied,
  isOfferedIn,
  normalLoadFor,
  normaliseCode,
  offeringTermsOf,
  resolveSchedulerConfig,
  type CustomSemesterBucket,
  type PlanWarning,
  type RequisiteCondition,
  type SchedulableUnit,
  type SchedulerConfig,
} from '../../services/scheduling/customPlannerScheduler';

export type ValidatePlanInput = {
  semesters: CustomSemesterBucket[];
  completedUnitCodes: string[];
  concededPassUnitCodes?: string[];
  intakeSemester?: 1 | 2;
  /** Everything the student must pass to graduate. Omit to skip the compulsory check. */
  requiredUnits?: SchedulableUnit[];
  /** Offering and requisite data for units in the plan, keyed by normalised code. */
  unitData?: Map<string, SchedulableUnit>;
  config?: Partial<SchedulerConfig>;
};

type GroupFailure = {
  missing: string[];
  concededPass: string[];
  conflictsWith: string[];
  creditPointsNeeded?: number;
};

function assessGroup(
  group: ReadonlyArray<RequisiteCondition>,
  completed: Set<string>,
  concededPass: Set<string>,
  bucketCodes: Set<string>,
  totalCredits: number,
): GroupFailure | null {
  const failure: GroupFailure = { missing: [], concededPass: [], conflictsWith: [] };
  let satisfied = true;

  for (const condition of group) {
    if (isConditionSatisfied(condition, completed, concededPass, bucketCodes, totalCredits)) continue;
    satisfied = false;

    if (condition.type === 'credit_points') {
      failure.creditPointsNeeded = condition.creditPoints ?? 0;
      continue;
    }
    if (!condition.unitCode) continue;

    const code = normaliseCode(condition.unitCode);
    if (condition.requisiteType === 'antirequisite') {
      failure.conflictsWith.push(code);
    } else {
      failure.missing.push(code);
      // Taken, but a Conceded Pass cannot satisfy a prerequisite or corequisite
      if (concededPass.has(code)) failure.concededPass.push(code);
    }
  }

  return satisfied ? null : failure;
}

function toRequisiteWarning(unitCode: string, failure: GroupFailure): PlanWarning {
  return {
    kind: 'requisite_violation',
    unitCode,
    missing: failure.missing,
    ...(failure.concededPass.length > 0 ? { concededPass: failure.concededPass } : {}),
    ...(failure.conflictsWith.length > 0 ? { conflictsWith: failure.conflictsWith } : {}),
    ...(failure.creditPointsNeeded !== undefined ? { creditPointsNeeded: failure.creditPointsNeeded } : {}),
  };
}

/**
 * Warnings are ordered by position: everything about semester one, then two, and
 * so on, followed by the plan-level facts (duplicates, then compulsory units).
 *
 * A unit with no entry in unitData has its requisites and offerings unchecked,
 * and is reported as no_offering_data so the gap is visible.
 */
export function validatePlan(input: ValidatePlanInput): PlanWarning[] {
  const cfg = resolveSchedulerConfig(input.config);
  const normalLoad = normalLoadFor(cfg);
  const intakeSemester = input.intakeSemester ?? 1;

  const concededPass = new Set((input.concededPassUnitCodes ?? []).map(normaliseCode));
  const completed = new Set([...input.completedUnitCodes.map(normaliseCode), ...concededPass]);

  const warnings: PlanWarning[] = [];
  const placements = new Map<string, { year: number; semester: 1 | 2 }[]>();

  for (const bucket of input.semesters) {
    const calendarTerm = calendarTermFor(bucket.semester, intakeSemester);
    const bucketCodes = new Set(bucket.units.map((u) => normaliseCode(u.code)));
    // Credits earned before this semester, matching how the scheduler counts them
    const totalCredits = completed.size * cfg.creditPointsPerUnit;

    for (const scheduled of bucket.units) {
      const code = normaliseCode(scheduled.code);
      const positions = placements.get(code) ?? [];
      positions.push({ year: bucket.year, semester: bucket.semester });
      placements.set(code, positions);

      const data = input.unitData?.get(code);
      if (!data) {
        warnings.push({ kind: 'no_offering_data', unitCode: scheduled.code });
        continue;
      }

      const terms = offeringTermsOf(data);
      if (terms.length === 0) {
        warnings.push({ kind: 'no_offering_data', unitCode: scheduled.code });
      } else if (data.offeringSemesters.length === 0) {
        warnings.push({ kind: 'short_term_only', unitCode: scheduled.code, offeringTerms: terms });
      } else if (!isOfferedIn(data, calendarTerm)) {
        warnings.push({ kind: 'not_offered', unitCode: scheduled.code, offeringTerms: terms });
      }

      if (data.requisiteGroups.length > 0) {
        const failures = data.requisiteGroups.map((group) =>
          assessGroup(group, completed, concededPass, bucketCodes, totalCredits),
        );
        // Groups are alternatives, so one satisfied group is enough
        if (failures.every((failure) => failure !== null)) {
          const problemSize = (f: GroupFailure) =>
            f.missing.length + f.conflictsWith.length + (f.creditPointsNeeded !== undefined ? 1 : 0);
          const closest = (failures as GroupFailure[]).slice().sort((a, b) => problemSize(a) - problemSize(b))[0];
          warnings.push(toRequisiteWarning(scheduled.code, closest));
        }
      }
    }

    const standardCount = bucket.units.filter((u) => u.category !== 'mpu').length;
    if (standardCount > normalLoad) {
      warnings.push({
        kind: 'over_capacity',
        year: bucket.year,
        semester: bucket.semester,
        count: standardCount,
        limit: normalLoad,
      });
    }

    for (const code of bucketCodes) completed.add(code);
  }

  for (const [code, positions] of placements) {
    if (positions.length > 1) {
      warnings.push({ kind: 'duplicate_placement', unitCode: code, positions });
    }
  }

  if (input.requiredUnits) {
    const planned = new Set(placements.keys());
    const missing = input.requiredUnits
      .map((unit) => unit.code)
      .filter((code) => {
        const normalised = normaliseCode(code);
        return !planned.has(normalised) && !completed.has(normalised);
      });
    if (missing.length > 0) {
      warnings.push({ kind: 'compulsory_missing', unitCodes: missing });
    }
  }

  return warnings;
}
