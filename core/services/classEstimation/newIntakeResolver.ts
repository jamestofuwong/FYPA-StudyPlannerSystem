// ============================================================
// Phase 8. Which units a brand-new student takes in their first semester.
//
// A new student has not picked a major, and would not be distinguishable by one even if they had: the
// matching work established that every major in this course shares its first-year units, which is 
// why a first-year student's major cannot be detected. The same fact makes this easy. The first semester of
// year one is the same units whichever major they eventually choose, so the intersection across the majors
// is the answer rather than a compromise.
//
// Two wrinkles in the real data, both handled rather than assumed away:
//
//   The target intake usually has no planners yet. Planners are imported ahead of an intake, not years
//   ahead, so estimating semester 1 of 2027 finds nothing for 2027 and falls back to the most recent intake
//   loaded, on the reasonable assumption that next year's first semester looks like this year's. Reported as
//   a warning, because a curriculum change would silently invalidate it.
//
//   Slot semesters count from the planner's own intake, not the calendar. A September-intake planner's
//   "semester 1" is calendar semester 2, so slots are converted before being compared to the target term.
//   Twenty of the forty-five loaded planners are September intakes, so skipping this would put every one of
//   them in the wrong half of the year.
// ============================================================

import * as plannerRepository from '../../db/repositories/plannerRepository';
import { intakeSemesterFromMonth } from '../matching/plannerTemplateBuilder';
import { calendarTermFor } from '../scheduling/customPlannerScheduler';

export interface NewIntakeUnits {
  /** Units every candidate planner puts in a new student's first semester. */
  codes: string[];
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
 * Units in a planner's first semester of year one, as calendar terms.
 *
 * Year one only: a new student has no credit, so nothing later is open to them, and the requisite chain
 * would block it anyway.
 */
function firstSemesterUnits(planner: DbPlanner, targetTerm: 1 | 2): Set<string> {
  const intakeSemester = intakeSemesterFromMonth(planner.intake_month);
  const codes = new Set<string>();

  for (const tu of planner.units) {
    if (!tu.unit) continue;
    if (tu.year_level !== 1) continue;
    if (tu.semester !== 1 && tu.semester !== 2) continue;   // summer and winter are never a first load
    if (calendarTermFor(tu.semester, intakeSemester) !== targetTerm) continue;

    // MPU units are excluded: they are compulsory but sit outside the estimate everywhere else in this
    // module, so counting them here would make new intake the only place they appear.
    if (tu.category === 'mpu') continue;

    codes.add(tu.unit.unit_code);
  }

  return codes;
}

/**
 * The units to put a manual new-intake figure onto. Only units every candidate planner agrees on, so a
 * major-specific unit is never charged to students who have not chosen that major.
 */
export async function resolveNewIntakeUnits(
  targetYear: number,
  targetTerm: 1 | 2,
): Promise<NewIntakeUnits> {
  const planners = await plannerRepository.getAllPlannersWithUnits();
  const picked = pickPlanners(planners, targetYear, targetTerm);

  if (!picked) {
    return {
      codes: [],
      basedOnIntakeYear: targetYear,
      basedOnIntakeSemester: targetTerm,
      warnings: ['No planners are loaded, so no units could be worked out for new students.'],
    };
  }

  const perPlanner = picked.chosen.map((planner) => firstSemesterUnits(planner, targetTerm));
  const shared = perPlanner.reduce(
    (common, next) => new Set([...common].filter((code) => next.has(code))),
    perPlanner[0] ?? new Set<string>(),
  );

  const warnings = [...picked.warnings];
  if (shared.size === 0) {
    warnings.push(
      `The ${picked.year} semester ${picked.semester} planners share no first-semester units, so the `
      + `new-intake figure has nowhere to go and is not counted.`,
    );
  } else if (perPlanner.some((set) => set.size !== shared.size)) {
    warnings.push(
      'Some majors put extra units in a new student\'s first semester. Only the units common to every major '
      + 'are counted, so those are left out rather than charged to students who may not take them.',
    );
  }

  return {
    codes: [...shared].sort(),
    basedOnIntakeYear: picked.year,
    basedOnIntakeSemester: picked.semester,
    warnings,
  };
}
