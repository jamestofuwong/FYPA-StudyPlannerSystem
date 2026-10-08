// ============================================================
// Phase 8. Which units a brand-new student takes in their first semester: Year 1, Semester 1.
//
// New students are not in the portal, so they are a number the Head of Department types in, and they all
// start in the same place: the first slot of a Computer Science planner. Every major's Year 1, Semester 1
// units are read and the whole figure goes onto them, so those units rise by the full intake rather than the
// students being spread around. In every intake loaded so far all five majors share that first semester
// exactly; should one ever differ, a unit only some majors take gets the matching share of the students.
//
// Credit-transfer students, who start part way through, are not handled here. They are rare and the Head of
// Department places them by hand.
//
// Two wrinkles in the real data, both handled rather than assumed away:
//
//   The target intake usually has no planners yet. Planners are imported ahead of an intake, not years
//   ahead, so estimating semester 1 of 2027 finds nothing for 2027 and falls back to the most recent intake
//   loaded, on the reasonable assumption that next year's first semester looks like this year's. Reported as
//   a warning, because a curriculum change would silently invalidate it.
//
//   A new student always starts in Year 1, Semester 1 of their planner, whichever calendar semester their
//   intake begins in. So the target semester decides which intake's planners are read, February and March
//   intakes for semester 1, September intakes for semester 2, and the units are always that first slot.
// ============================================================

import * as plannerRepository from '../../db/repositories/plannerRepository';
import { intakeSemesterFromMonth } from '../matching/plannerTemplateBuilder';

export interface NewIntakeUnits {
  /** Units any Computer Science major puts in Year 1, Semester 1, sorted. */
  codes: string[];
  /**
   * Share of the new students expected in each unit: 1 for a unit every major puts in Year 1, Semester 1,
   * less for one only some majors have. A new student has not chosen a major, so a unit in 3 of 5 majors is
   * counted for 3 in 5 of them rather than for all of them or none.
   */
  shares: Record<string, number>;
  /** The intake the units were read from, which is not always the one being estimated. */
  basedOnIntakeYear: number;
  basedOnIntakeSemester: 1 | 2;
  /** Anything a reader needs to know before trusting the list. */
  warnings: string[];
}

type DbPlanner = Awaited<ReturnType<typeof plannerRepository.getAllPlannersWithUnits>>[number];

/**
 * The planners a new student starting in the target term would be on: that exact intake if it is loaded,
 * otherwise the most recent intake for the same semester, otherwise the most recent intake there is.
 */
function pickPlanners(
  planners: DbPlanner[],
  targetYear: number,
  targetTerm: 1 | 2,
): { chosen: DbPlanner[]; year: number; semester: 1 | 2; warnings: string[] } | null {
  const warnings: string[] = [];
  const withSemester = planners.map((planner) => ({
    planner,
    year: planner.intake_year,
    semester: intakeSemesterFromMonth(planner.intake_month),
  }));
  if (withSemester.length === 0) return null;

  const exact = withSemester.filter((p) => p.year === targetYear && p.semester === targetTerm);
  if (exact.length > 0) {
    return { chosen: exact.map((p) => p.planner), year: targetYear, semester: targetTerm, warnings };
  }

  // Same semester, most recent year. Preferred over a nearer year in the other semester, because the two
  // semesters of an intake carry different first-semester units.
  const sameSemester = withSemester.filter((p) => p.semester === targetTerm);
  const pool = sameSemester.length > 0 ? sameSemester : withSemester;
  const latestYear = Math.max(...pool.map((p) => p.year));
  const chosen = pool.filter((p) => p.year === latestYear);
  const semester = chosen[0].semester;

  warnings.push(
    `No planner is loaded for the ${targetYear} semester ${targetTerm} intake, so new-student units were read `
    + `from the ${latestYear} semester ${semester} intake instead. A curriculum change since then would make `
    + `this wrong.`,
  );
  if (sameSemester.length === 0) {
    warnings.push(
      `No planner is loaded for any semester ${targetTerm} intake either, so the units come from a semester `
      + `${semester} intake, whose first semester may differ.`,
    );
  }

  return { chosen: chosen.map((p) => p.planner), year: latestYear, semester, warnings };
}

/**
 * The units in a planner's Year 1, Semester 1 slot: what a brand-new student takes in their first semester.
 *
 * Always the planner's own first slot, never picked by calendar term. A new student starts at the start of
 * their planner whenever their intake is, so a September student's first semester is still Year 1,
 * Semester 1 of a September planner. Matching the intake to the semester is pickPlanners' job.
 */
function firstSemesterUnits(planner: DbPlanner): Set<string> {
  const codes = new Set<string>();

  for (const tu of planner.units) {
    if (!tu.unit) continue;
    if (tu.year_level !== 1 || tu.semester !== 1) continue;

    // MPU units are excluded: they are compulsory but sit outside the estimate everywhere else in this
    // module, so counting them here would make new intake the only place they appear.
    if (tu.category === 'mpu') continue;

    codes.add(tu.unit.unit_code);
  }

  return codes;
}

/** Bachelor of Computer Science planners, the course class estimation covers. */
function isComputerSciencePlanner(planner: DbPlanner): boolean {
  return /computer science/i.test((planner as { course?: { name?: string } | null }).course?.name ?? '');
}

/**
 * The units to put the new-student figure onto: every Computer Science major's Year 1, Semester 1 units.
 *
 * In every intake loaded so far the five majors share the same first semester, so every unit gets the full
 * new-student count. Should a future planner differ, a unit only some majors take gets the matching share
 * rather than being dropped, which would undercount it, or counted in full, which would overcount it.
 */
export async function resolveNewIntakeUnits(
  targetYear: number,
  targetTerm: 1 | 2,
): Promise<NewIntakeUnits> {
  const all = await plannerRepository.getAllPlannersWithUnits();
  const computerScience = all.filter(isComputerSciencePlanner);
  // Every loaded planner is Computer Science today. Should none be named that way, using them all beats
  // placing new students nowhere, and the warning below says it happened.
  const planners = computerScience.length > 0 ? computerScience : all;
  const picked = pickPlanners(planners, targetYear, targetTerm);

  if (!picked) {
    return {
      codes: [],
      shares: {},
      basedOnIntakeYear: targetYear,
      basedOnIntakeSemester: targetTerm,
      warnings: ['No planners are loaded, so no units could be worked out for new students.'],
    };
  }

  const warnings = [...picked.warnings];
  if (computerScience.length === 0 && all.length > 0) {
    warnings.push('No planner is named as Bachelor of Computer Science, so every loaded planner was used.');
  }

  const perPlanner = picked.chosen.map(firstSemesterUnits);
  const counts = new Map<string, number>();
  for (const units of perPlanner) {
    for (const code of units) counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const shares: Record<string, number> = {};
  for (const [code, n] of counts) shares[code] = n / perPlanner.length;

  const partial = Object.entries(shares).filter(([, share]) => share < 1).map(([code]) => code).sort();
  if (counts.size === 0) {
    warnings.push(
      `The ${picked.year} semester ${picked.semester} planners have no Year 1, Semester 1 units, so the `
      + 'new-student figure has nowhere to go and is not counted.',
    );
  } else if (partial.length > 0) {
    warnings.push(
      `Not every major takes ${partial.join(', ')} in Year 1, Semester 1, so ${partial.length === 1 ? 'it gets' : 'they get'} `
      + 'only the share of new students matching the majors that do.',
    );
  }

  return {
    codes: [...counts.keys()].sort(),
    shares,
    basedOnIntakeYear: picked.year,
    basedOnIntakeSemester: picked.semester,
    warnings,
  };
}
