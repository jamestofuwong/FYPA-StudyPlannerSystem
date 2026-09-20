// ============================================================
// Maps a portal-scraped ScrapedStudent into the RawStudentInput that
// runMatchingPipeline() needs. ScrapedStudent has no intakeYear,
// intakeSemester, courseType, or hasWIL field, so every one of those is
// either derived from a weaker signal or defaulted from config. Every
// default is recorded in the returned warnings array so a run can be
// audited afterward rather than trusting silent guesses.
// ============================================================

import type { CourseType, RawStudentInput } from '../../shared/types/matching';
import type { ScrapedStudent } from '../../shared/types/student';
import { getCompletedUnitCodes } from '../../shared/constants/grades';
import { DEFAULT_CLASS_ESTIMATION_CONFIG, type ClassEstimationConfig } from '../../shared/types/classEstimation';

export interface MappedRawStudentInput {
  rawInput: RawStudentInput;
  warnings: string[];
}

// Buckets a calendar month into a semester, using the same Feb-Apr /
// Aug-Oct intake bands unitRepository.ts's mapProgressionToCalendarTerm
// uses, extended to a full 12-month partition (Jan-Jun -> 1, Jul-Dec -> 2)
// so every month resolves to something instead of only the two named bands.
export function deriveSemesterFromMonth(month: number): 1 | 2 {
  return month >= 7 ? 2 : 1;
}

// Reads the year and month straight off the text instead of going through new Date(). The portal's date is
// DD/MM/YYYY (dashboard/page.tsx parses it the same way), and new Date() rejects that when the day is above 12
// and silently swaps day and month when it isn't, so 1 Sep 2023 would come out as January. ISO strings are read
// by their written date too, since new Date() applies the local timezone to one with a time part, which pushes
// a boundary date like 1 July back into June. A middle segment that isn't a valid month returns null, so the
// caller warns rather than guessing which of DD/MM and MM/DD was meant.
export function parseEnrollmentYearMonth(raw: string | null | undefined): { year: number; month: number } | null {
  const text = (raw ?? '').trim();

  const dayMonthYear = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dayMonthYear) {
    const month = parseInt(dayMonthYear[2], 10);
    return month >= 1 && month <= 12 ? { year: parseInt(dayMonthYear[3], 10), month } : null;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) {
    const month = parseInt(iso[2], 10);
    return month >= 1 && month <= 12 ? { year: parseInt(iso[1], 10), month } : null;
  }

  return null;
}

export function mapScrapedStudentToRawInput(
  scraped: ScrapedStudent,
  studentId: string,
  config: ClassEstimationConfig = DEFAULT_CLASS_ESTIMATION_CONFIG,
): MappedRawStudentInput {
  const warnings: string[] = [];

  const completedUnitCodes = getCompletedUnitCodes(scraped.courseList);

  const enrollment = parseEnrollmentYearMonth(scraped.enrollmentDate);

  let intakeYear: number;
  let intakeSemester: 1 | 2;
  if (enrollment) {
    intakeYear = enrollment.year;
    intakeSemester = deriveSemesterFromMonth(enrollment.month);
  } else {
    intakeYear = new Date().getUTCFullYear();
    intakeSemester = 1;
    warnings.push('intakeYear/intakeSemester defaulted to the current year and semester 1: enrollmentDate was missing or unparseable');
  }

  // courseType does not affect which planners are considered (confirmed by
  // reading plannerFilter.ts, it only filters by intakeYear/intakeSemester),
  // so a flat default carries no risk of mis-routing a student. Recorded
  // here anyway for traceability, since it's still a guess.
  const courseType: CourseType = 'degree';
  warnings.push('courseType defaulted to "degree" (inert to planner selection, see plannerFilter.ts)');

  // No portal field signals whether a student has completed/been approved
  // for WIL. Defaulted from config rather than guessed per student, since
  // it does affect free-elective slot scoring.
  const hasWIL = config.defaultHasWIL;
  warnings.push(`hasWIL defaulted to ${config.defaultHasWIL} from config (no signal available in scraped data)`);

  // Only affects unavailableUnits/WIL-exemption ordering inside the
  // matching pipeline itself, not class estimation's own eligibility
  // filtering, which checks offering semesters independently.
  const currentSemester = deriveSemesterFromMonth(new Date().getUTCMonth() + 1);

  const rawInput: RawStudentInput = {
    studentID: studentId,
    courseType,
    intakeYear,
    intakeSemester,
    currentSemester,
    completedUnitCodes,
    hasWIL,
  };

  return { rawInput, warnings };
}
