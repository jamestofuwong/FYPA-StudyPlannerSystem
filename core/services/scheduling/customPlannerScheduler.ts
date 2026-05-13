// ============================================================
// Custom Planner Scheduler
// Builds an extended semester-by-semester study plan for
// students who need more time than the standard template.
//
// Rules:
//  - Max 4 standard units per semester
//  - Max 1 MPU unit per semester
//  - Requisites must be satisfied before/alongside a unit
//  - Units are only placed in semesters they are offered in
//    (offered_in = 1 | 2; null = available any semester)
// ============================================================

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

export function buildCustomPlan(
  remainingUnits: SchedulableUnit[],
  completedUnitCodes: string[],
  startYear: number,
  startSemester: 1 | 2
): CustomPlanResult {
  const completed = new Set(completedUnitCodes.map((c) => c.trim().toUpperCase()));
  const pool: SchedulableUnit[] = [...remainingUnits];
  const semesters: CustomSemesterBucket[] = [];

  let currentYear = startYear;
  let currentSem: 1 | 2 = startSemester;
  let consecutiveIdle = 0;

  for (let i = 0; i < MAX_SEMESTERS && pool.length > 0; i++) {
    const totalCredits = completed.size * CREDIT_POINTS_PER_UNIT;


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

        if (canTake(unit, currentSem, completed, bucketCodes, totalCredits)) {
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

function canTake(
  unit: SchedulableUnit,
  sem: 1 | 2,
  completed: Set<string>,
  bucketCodes: Set<string>,
  totalCredits: number
): boolean {
  if (unit.offeringSemesters.length > 0 && !unit.offeringSemesters.includes(sem)) return false;
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
