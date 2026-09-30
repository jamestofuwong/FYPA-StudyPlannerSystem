import {
  offeringTermsOf,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';

/**
 * Calendar terms named by the months they run in.
 *
 * "Semester 2" is ambiguous on this page: the header counts slots from the
 * student's intake, while an offering term is a calendar term, and for a
 * September intake the two are swapped. Months belong to neither counting, so
 * they say the same thing to every reader.
 */
export const TERM_MONTHS: Record<number, string> = { 1: 'Feb/Mar', 2: 'Aug/Sep', 3: 'summer', 4: 'winter' };

export const monthsOf = (term: number) => TERM_MONTHS[term] ?? `term ${term}`;

type Offered = Pick<SchedulableUnit, 'offeringSemesters' | 'allOfferingTerms'>;

/**
 * What to tell an advisor about a unit's offering in one calendar term, or an
 * empty string when it runs then.
 *
 * A unit whose only terms are summer or winter has no placeable semester, but
 * its terms are known, so it says where it does run. "Offering unknown" is only
 * for a unit with no offering rows at all.
 */
export function offeringHint(unit: Offered, calendarTerm: 1 | 2): string {
  if (unit.offeringSemesters.length === 0) {
    const known = offeringTermsOf(unit as SchedulableUnit);
    if (known.length === 0) return 'offering unknown';
    return `only runs in ${known.map(monthsOf).join(' and ')}`;
  }
  return unit.offeringSemesters.includes(calendarTerm) ? '' : 'not offered this term';
}
