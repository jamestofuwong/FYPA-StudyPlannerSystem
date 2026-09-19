// Builds an extended semester-by-semester study plan for
// students who need more time than the standard template.
//
// Rules:
//  - Max 4 standard units per semester
//  - Max 1 MPU unit per semester
//  - Requisites must be satisfied before/alongside a unit
//  - Units are only placed in semesters they are offered in, per their
//    unit_offerings rows (calendar terms). A unit with no rows is
//    available in any semester.

const MAX_STANDARD_PER_SEM = 4;
const MAX_MPU_PER_SEM = 1;
const MAX_SEMESTERS = 20;
const CREDIT_POINTS_PER_UNIT = 12.5;

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
  offeringSemesters: (1 | 2)[];

  requisiteGroups: RequisiteCondition[][];
}

export interface ScheduledUnit {
  code: string;
  name: string;
  category: string;
}

export interface CustomSemesterBucket {
  year: number;
  semester: 1 | 2;
  units: ScheduledUnit[];
}

export interface CustomPlanResult {
  semesters: CustomSemesterBucket[];
  unschedulableUnits: ScheduledUnit[];
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
  intakeSemester: 1 | 2 = 1
): CustomPlanResult {
  const completed = new Set(completedUnitCodes.map((c) => c.trim().toUpperCase()));
  const pool: SchedulableUnit[] = [...remainingUnits];
  const semesters: CustomSemesterBucket[] = [];

  let currentYear = startYear;
  let currentSem: 1 | 2 = startSemester;
  let consecutiveIdle = 0;

  for (let i = 0; i < MAX_SEMESTERS && pool.length > 0; i++) {
    const totalCredits = completed.size * CREDIT_POINTS_PER_UNIT;
    // currentSem counts from the student's intake; offerings are calendar terms
    const calendarTerm: 1 | 2 = intakeSemester === 1 ? currentSem : (currentSem === 1 ? 2 : 1);


    const bucketCodes = new Set<string>();
    const toPlace: SchedulableUnit[] = [];

    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of pool) {
        if (bucketCodes.has(unit.code.toUpperCase())) continue;

        const isMpu = unit.category === 'mpu';
        const standardCount = toPlace.filter((u) => u.category !== 'mpu').length;
        const mpuCount = toPlace.filter((u) => u.category === 'mpu').length;

        if (isMpu && mpuCount >= MAX_MPU_PER_SEM) continue;
        if (!isMpu && standardCount >= MAX_STANDARD_PER_SEM) continue;

        if (canTake(unit, calendarTerm, completed, bucketCodes, totalCredits)) {
          toPlace.push(unit);
          bucketCodes.add(unit.code.toUpperCase());
          changed = true;
        }
      }
    }

    if (toPlace.length === 0) {
      consecutiveIdle++;
      if (consecutiveIdle >= 2) break;
    } else {
      consecutiveIdle = 0;
      for (const unit of toPlace) {
        completed.add(unit.code.toUpperCase());
        pool.splice(pool.indexOf(unit), 1);
      }
      semesters.push({
        year: currentYear,
        semester: currentSem,
        units: toPlace.map((u) => ({ code: u.code, name: u.name, category: u.category })),
      });
    }

    if (currentSem === 1) {
      currentSem = 2;
    } else {
      currentSem = 1;
      currentYear++;
    }
  }

  return {
    semesters,
    unschedulableUnits: pool.map((u) => ({ code: u.code, name: u.name, category: u.category })),
  };
}

export function canTake(
  unit: SchedulableUnit,
  calendarTerm: 1 | 2,
  completed: Set<string>,
  bucketCodes: Set<string>,
  totalCredits: number
): boolean {
  if (unit.offeringSemesters.length > 0 && !unit.offeringSemesters.includes(calendarTerm)) return false;
  if (unit.requisiteGroups.length === 0) return true;
  return unit.requisiteGroups.some((group) =>
    group.every((condition) => isConditionSatisfied(condition, completed, bucketCodes, totalCredits))
  );
}

function isConditionSatisfied(
  condition: RequisiteCondition,
  completed: Set<string>,
  bucketCodes: Set<string>,
  totalCredits: number
): boolean {
  if (condition.type === 'credit_points') {
    return totalCredits >= (condition.creditPoints ?? 0);
  }

  if (condition.type === 'unit' && condition.unitCode) {
    const code = condition.unitCode.toUpperCase();
    switch (condition.requisiteType) {
      case 'corequisite':
        return completed.has(code) || bucketCodes.has(code);
      case 'antirequisite':
        return !completed.has(code) && !bucketCodes.has(code);
      case 'prerequisite':
      default:
        return completed.has(code);
    }
  }

  return false;
}
