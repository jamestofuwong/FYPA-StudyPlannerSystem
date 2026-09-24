// Edit operations on a generated plan, for advisors rearranging it by hand.
//
// Pure functions: each takes a semesters array and returns a new one, never
// mutating the input. They live here rather than in the page so they can be
// tested without React, and so the student app can reuse them for its own
// editing step, the same reason validatePlan is here.
//
// None of them judges the result. An advisor may produce an arrangement that
// breaks requisites or exceeds the normal load; validatePlan reports that.

import {
  normaliseCode,
  type CustomSemesterBucket,
  type ScheduledUnit,
} from '../../services/scheduling/customPlannerScheduler';

/** Anything carrying the three fields a placed unit needs. */
export type PlaceableUnit = {
  code: string;
  name: string;
  category: string;
  recommended?: boolean;
};

function copy(semesters: ReadonlyArray<CustomSemesterBucket>): CustomSemesterBucket[] {
  return semesters.map((bucket) => ({ ...bucket, units: [...bucket.units] }));
}

function findPlaced(
  semesters: ReadonlyArray<CustomSemesterBucket>,
  code: string,
): ScheduledUnit | undefined {
  for (const bucket of semesters) {
    const found = bucket.units.find((unit) => normaliseCode(unit.code) === code);
    if (found) return found;
  }
  return undefined;
}

/** Drops a unit wherever it sits. A code that is not placed leaves the plan as it was. */
export function removeUnit(
  semesters: ReadonlyArray<CustomSemesterBucket>,
  unitCode: string,
): CustomSemesterBucket[] {
  const code = normaliseCode(unitCode);
  // An emptied semester stays, since the advisor may be about to refill it
  return semesters.map((bucket) => ({
    ...bucket,
    units: bucket.units.filter((unit) => normaliseCode(unit.code) !== code),
  }));
}

/**
 * Puts a unit in the given slot. A unit already placed elsewhere is moved
 * rather than copied, so this can never create a duplicate_placement.
 * An unknown slot leaves the plan as it was.
 */
export function addUnit(
  semesters: ReadonlyArray<CustomSemesterBucket>,
  unit: PlaceableUnit,
  year: number,
  semester: 1 | 2,
): CustomSemesterBucket[] {
  const targetExists = semesters.some((b) => b.year === year && b.semester === semester);
  if (!targetExists) return copy(semesters);

  const code = normaliseCode(unit.code);
  if (findPlaced(semesters, code)) return moveUnit(semesters, code, year, semester);

  const placed: ScheduledUnit = {
    code: unit.code,
    name: unit.name,
    category: unit.category,
    // A re-added unit stays a recommendation; the advisor moving it does not
    // make it something the planner asked for
    ...(unit.recommended ? { recommended: true } : {}),
  };
  return semesters.map((bucket) =>
    bucket.year === year && bucket.semester === semester
      ? { ...bucket, units: [...bucket.units, placed] }
      : { ...bucket, units: [...bucket.units] },
  );
}

/**
 * Moves a placed unit to another slot, keeping its name and category. A unit
 * that is not placed, an unknown slot, or a move to where it already sits all
 * leave the plan as it was.
 */
export function moveUnit(
  semesters: ReadonlyArray<CustomSemesterBucket>,
  unitCode: string,
  toYear: number,
  toSemester: 1 | 2,
): CustomSemesterBucket[] {
  const code = normaliseCode(unitCode);
  const placed = findPlaced(semesters, code);
  if (!placed) return copy(semesters);

  const target = semesters.find((b) => b.year === toYear && b.semester === toSemester);
  if (!target) return copy(semesters);
  if (target.units.some((unit) => normaliseCode(unit.code) === code)) return copy(semesters);

  return semesters.map((bucket) => {
    const units = bucket.units.filter((unit) => normaliseCode(unit.code) !== code);
    if (bucket.year === toYear && bucket.semester === toSemester) units.push(placed);
    return { ...bucket, units };
  });
}

/**
 * Appends an empty slot after the last one. Semester 1 is followed by semester 2
 * of the same year, semester 2 by semester 1 of the next. These are slot numbers
 * counted from the intake, not calendar terms.
 */
export function addSemester(
  semesters: ReadonlyArray<CustomSemesterBucket>,
): CustomSemesterBucket[] {
  const last = semesters[semesters.length - 1];
  const next: { year: number; semester: 1 | 2 } = !last
    ? { year: 1, semester: 1 }
    : last.semester === 1
      ? { year: last.year, semester: 2 }
      : { year: last.year + 1, semester: 1 };

  return [...copy(semesters), { year: next.year, semester: next.semester, units: [] }];
}
