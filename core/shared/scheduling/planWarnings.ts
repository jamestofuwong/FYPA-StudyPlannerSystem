// How a scheduling warning reads to a person. Shared by the advisor's Student
// Pathway and the student Plan Builder so the two say the same thing about the
// same problem.

import { calendarTermFor, type PlanWarning } from '../../services/scheduling/customPlannerScheduler';
import { monthsOf } from './planTerms';

const CATEGORY_NAMES: Record<string, string> = {
  core: 'Core units',
  major: 'Major core units',
  major_core: 'Major core units',
  elective: 'Electives',
  prescribed_elective: 'Prescribed electives',
  wil: 'Work-Integrated Learning',
  mpu: 'MPU units',
};

export function listCodes(codes: string[]): string {
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

export function describePlanWarning(w: PlanWarning, maxSemesters: number, intakeSemester: 1 | 2): string | null {
  switch (w.kind) {
    case 'requisite_violation': {
      const parts: string[] = [];
      const concededPass = new Set(w.concededPass ?? []);
      const notInPlan = w.missing.filter((c) => !concededPass.has(c));
      if (notInPlan.length > 0) {
        parts.push(`needs ${listCodes(notInPlan)}, which ${notInPlan.length === 1 ? 'is' : 'are'} not in this plan`);
      }
      if (concededPass.size > 0) {
        parts.push(`needs ${listCodes([...concededPass])}, but a Conceded Pass cannot satisfy a prerequisite`);
      }
      if (w.conflictsWith?.length) {
        parts.push(`cannot be taken with ${listCodes(w.conflictsWith)}, which is already taken`);
      }
      if (w.creditPointsNeeded !== undefined) {
        parts.push(`needs ${w.creditPointsNeeded} credit points, which this plan never reaches`);
      }
      return `${w.unitCode} ${parts.length > 0 ? parts.join('; ') : 'has requisites that cannot be met'}`;
    }
    case 'not_offered': {
      const runsIn = listCodes(w.offeringTerms.map(monthsOf));
      // placedIn means an advisor put it there by hand, so the scheduler's
      // "could not be fitted" wording would be wrong.
      if (w.placedIn) {
        const slotMonths = monthsOf(calendarTermFor(w.placedIn.semester, intakeSemester));
        return `${w.unitCode} only runs in ${runsIn}, but Y${w.placedIn.year} S${w.placedIn.semester} is a ${slotMonths} term for this student`;
      }
      const noSuchTerm = w.offeringTerms.length === 1
        ? `no ${runsIn} term was available`
        : 'none of those terms was available';
      return `${w.unitCode} only runs in ${runsIn}, and ${noSuchTerm} within the plan`;
    }
    case 'short_term_only':
      return `${w.unitCode} is only offered in summer/winter, which this plan does not schedule`;
    case 'budget_exhausted':
      return `${w.unitCodes.length} unit${w.unitCodes.length !== 1 ? 's' : ''} could not be placed within ${maxSemesters} semesters: ${w.unitCodes.join(', ')}`;
    case 'no_offering_data':
      return `${w.unitCode} has no offering data, so its placement is unverified`;
    case 'duplicate_placement':
      return `${w.unitCode} appears in ${w.positions.length} semesters: ${w.positions.map((p) => `Y${p.year} S${p.semester}`).join(', ')}`;
    case 'compulsory_missing':
      return `${listCodes(w.unitCodes)} ${w.unitCodes.length === 1 ? 'is' : 'are'} required to graduate but ${w.unitCodes.length === 1 ? 'is' : 'are'} not in this plan`;
    case 'conceded_pass_retake':
      // Routine, not an error: the RETAKE badge's own "(CP)" suffix and
      // shortened tooltip say this already. A full sentence duplicated on
      // the same row would overstate ordinary, correctly-handled behaviour.
      return null;
    case 'requirement_shortfall':
      return `${CATEGORY_NAMES[w.category] ?? w.category} total ${w.have} credit points, but ${w.need} are required to graduate`;
    case 'requirement_excess':
      return `${CATEGORY_NAMES[w.category] ?? w.category} total ${w.have} credit points, ${w.have - w.need} more than the ${w.need} required`;
    default:
      // over_capacity is shown on the semester it concerns
      return null;
  }
}
