// ============================================================
// Custom Planner Scheduler
// Builds an extended semester-by-semester study plan for
// students who need more time than the standard template.
//
// Rules:
//  - Max 4 standard units per semester
//  - Max 1 MPU unit per semester
//  - Prerequisites must be satisfied before a unit is placed
//  - Units are only placed in semesters they are offered in
//    (offered_in = 1 | 2; null = available any semester)
// ============================================================

const MAX_STANDARD_PER_SEM = 4;
const MAX_MPU_PER_SEM = 1;
const MAX_SEMESTERS = 20;

export interface SchedulableUnit {
  code: string;
  name: string;
  category: string;
  /** Semesters this unit runs. Empty array = available any semester. */
  offeringSemesters: (1 | 2)[];
  /**
   * OR of ANDs — each inner array is a group of prerequisite unit codes
   * that must ALL be completed. At least one group must be fully satisfied.
   */
  prerequisiteGroups: string[][];
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
    const eligible = pool.filter((u) => canTake(u, currentSem, completed));

    const standardEligible = eligible.filter((u) => u.category !== 'mpu');
    const mpuEligible = eligible.filter((u) => u.category === 'mpu');

    const toPlace: SchedulableUnit[] = [
      ...standardEligible.slice(0, MAX_STANDARD_PER_SEM),
      ...mpuEligible.slice(0, MAX_MPU_PER_SEM),
    ];

    if (toPlace.length === 0) {
      consecutiveIdle++;
      // Two consecutive idle semesters = deadlock, stop trying
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

    // Advance to next semester
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

function canTake(unit: SchedulableUnit, sem: 1 | 2, completed: Set<string>): boolean {
  if (unit.offeringSemesters.length > 0 && !unit.offeringSemesters.includes(sem)) {
    return false;
  }
  if (unit.prerequisiteGroups.length === 0) return true;
  return unit.prerequisiteGroups.some((group) =>
    group.every((code) => completed.has(code.toUpperCase()))
  );
}
