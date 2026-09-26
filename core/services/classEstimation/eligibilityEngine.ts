// ============================================================
// Forward-looking eligibility check: can this student take unit X in a given future semester.
// checkRequisites() in core/services/matching/profileBuilder.ts is retrospective only, it flags problems
// among units already completed.
//
// This reuses canTake() and mapUnitToSchedulable() from customPlannerScheduler.ts rather than
// reimplementing them, an earlier version of this file did reimplement its own copy, and got the
// prerequisite/corequisite distinction wrong in the process (a prerequisite must come from prior
// completion only, a corequisite can also be satisfied by another unit picked in the same round). Reusing
// the already-correct, already-used-elsewhere logic avoids repeating that mistake.
//
// Inputs are passed as a named object rather than positionally. canTake() gained a parameter in the middle
// of its signature once already, which silently shifted every argument after it here and survived a merge.
// With named fields that same change is a compile error instead of a wrong answer.
// ============================================================

import {
  canTake,
  calendarTermFor,
  mapUnitToSchedulable,
  type SchedulableUnit,
  type RawSchedulableUnitRow,
} from '../scheduling/customPlannerScheduler';
import { intakeSemesterFromMonth } from '../matching/plannerTemplateBuilder';
import { getCachedPlannerById } from './plannerCache';

export type { SchedulableUnit };

/**
 * A unit, plus the semester its planner recommends taking it in.
 *
 * The recommended semester does NOT decide availability. A unit's offerings come from an explicit statement
 * in the planner PDF ("Feb/Mar", "Aug/Sept", "Semester 1"), parsed by normalise_offered_in() in
 * plannerStructureAssembler.py, so they are a claim about when the unit actually runs. A planner slot is
 * only where one major recommends fitting it in, and a unit offered in both semesters is routinely slotted
 * in different semesters by different majors. A student who failed a unit legitimately retakes it in
 * whichever semester comes next, so availability stays with the offerings.
 *
 * The recommended semester is carried here so the preview can point out predictions that fall outside it,
 * which is a useful thing for the HoD to sanity check, not a filter.
 */
export interface EligibilityUnit extends SchedulableUnit {
  /**
   * The calendar term this planner recommends, or null when it has no semester 1 or 2 slot, which covers
   * elective-pool units with no slot at all and the rare unit slotted only in summer or winter.
   */
  recommendedCalendarTerm: 1 | 2 | null;
}

// v1 does not resolve corequisites among candidates picked earlier in the same estimation round, that
// would need the same iterative fixed-point loop buildCustomPlan() uses across multiple semesters, which
// is out of scope for a single-semester eligibility check. A corequisite is therefore only satisfiable if
// it's already completed or in progress, same as a prerequisite, until that's built.
const NO_SAME_ROUND_PICKS = new Set<string>();

export interface EligibilityInput {
  /** The semester being estimated. */
  targetTerm: 1 | 2;
  /** Units the student has passed or is currently taking, uppercased. */
  completedOrInProgress: Set<string>;
  // The subset of completedOrInProgress held only as a Conceded Pass. Those units are not owed again, but
  // they cannot satisfy a prerequisite or corequisite, so they have to be named rather than inferred.
  concededPass: Set<string>;
  /** Credit points earned, for credit-point requisites such as "150cp before the capstone". */
  totalCreditsEarned: number;
}

/**
 * Whether the unit runs at all in the semester being estimated, before any requisite is considered. Decided
 * by the offerings, which are the only statement available about when a unit is actually taught.
 */
export function isAvailableInTargetTerm(unit: EligibilityUnit, targetTerm: 1 | 2): boolean {
  // A unit whose offering data lists only summer or winter terms cannot be taken in the semester being
  // estimated. canTake() can't see this on its own: it only reads offeringSemesters, which comes back empty
  // both for a short-term-only unit and for one with no offering data at all. Those two are not the same.
  // No data stays permissive, since 37 of the 67 units currently have none, including every unit whose PDF
  // stated both semesters at once, a phrasing normalise_offered_in() drops. Data that positively says
  // "never in a semester" is respected.
  const hasOfferingData = (unit.allOfferingTerms ?? []).length > 0;
  if (!hasOfferingData) return true;
  if (unit.offeringSemesters.length === 0) return false;
  return unit.offeringSemesters.includes(targetTerm);
}

/**
 * True when the unit is being predicted in a semester its planner does not recommend. Usually a retake or a
 * catch-up, which is legitimate, so this is reported and not filtered. It is worth surfacing because a unit
 * whose offerings are wrong shows up here first: if the HoD sees a whole cohort predicted into a semester
 * the planner never puts them in, the offerings row is the thing to check.
 */
export function isOutsideRecommendedTerm(unit: EligibilityUnit, targetTerm: 1 | 2): boolean {
  if (unit.recommendedCalendarTerm === null) return false;
  return unit.recommendedCalendarTerm !== targetTerm;
}

export function isUnitEligible(unit: EligibilityUnit, input: EligibilityInput): boolean {
  if (!isAvailableInTargetTerm(unit, input.targetTerm)) return false;

  return canTake(
    unit,
    input.targetTerm,
    input.completedOrInProgress,
    input.concededPass,
    NO_SAME_ROUND_PICKS,
    input.totalCreditsEarned,
  );
}

 // Builds a unitCode -> SchedulableUnit lookup for every unit reachable from a specific planner: its
 // slotted TemplateUnit rows and its elective-group pool units, since both are candidate categories for class estimation.
export async function buildEligibilityUnitsFromPlanner(plannerId: string): Promise<Map<string, EligibilityUnit>> {
  const planner = await getCachedPlannerById(plannerId);
  const eligibilityUnits = new Map<string, EligibilityUnit>();
  if (!planner) return eligibilityUnits;

  // A planner's slot semesters are counted from its own intake, not from the calendar. 20 of the 45 loaded
  // planners are September intakes, and for those the two are swapped: their semester 1 is calendar
  // semester 2. Comparing a raw slot number against the target term would report every September cohort as
  // being predicted outside its recommended semester when it is not.
  const intakeSemester = intakeSemesterFromMonth(planner.intake_month);

  for (const tu of planner.units) {
    if (!tu.unit) continue;
    if (eligibilityUnits.has(tu.unit.unit_code)) continue;

    // Only semesters 1 and 2 convert to a calendar term. A summer or winter slot leaves this null, since
    // there is no semester to compare a prediction against.
    const slot = tu.semester === 1 || tu.semester === 2 ? tu.semester : null;

    eligibilityUnits.set(tu.unit.unit_code, {
      ...mapUnitToSchedulable(tu.unit as RawSchedulableUnitRow, tu.category),
      recommendedCalendarTerm: slot === null ? null : calendarTermFor(slot, intakeSemester),
    });
  }

  for (const eg of planner.elective_groups) {
    for (const egu of eg.units) {
      if (eligibilityUnits.has(egu.unit.unit_code)) continue;
      eligibilityUnits.set(egu.unit.unit_code, {
        ...mapUnitToSchedulable(egu.unit as RawSchedulableUnitRow, 'prescribed_elective'),
        // Pool units carry no slot, so there is no recommended semester to compare against.
        recommendedCalendarTerm: null,
      });
    }
  }

  return eligibilityUnits;
}
