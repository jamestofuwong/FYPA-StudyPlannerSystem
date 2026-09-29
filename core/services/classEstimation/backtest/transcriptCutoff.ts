// ============================================================
// Phase 10. Cuts a transcript at a past semester, so the estimator can be tested on a semester whose real
// enrolments are already known.
//
// There is no historical enrolment data to check the estimator against, which is the reason it exists. What
// there is, is transcripts: every row says what a student took and when. Hide one past semester, predict it
// from what came before, and the hidden rows are the right answer. That is the only honest measurement
// available without new data.
//
// The cut has to reproduce what was knowable at the moment of prediction, not what is knowable now, or the
// test flatters itself. A prediction for semester T is made while semester T-1 is running, so:
//
//   before T-1               kept as they are, finished units with their real grades
//   T-1 itself               kept, but as in progress: no grade, no credit earned. A unit failed in T-1 was
//                            not known to have failed yet, and treating it as known would let the estimator
//                            "predict" a retake it had no way to foresee
//   short terms after T-1    dropped, they had not happened yet
//   T                        removed from the history and returned as the answer
//   after T                  dropped
//
// MPU units are left out of the answer because the estimator leaves them out of every prediction by design,
// so counting them would score it on units it was never asked about. Anything else a student took counts,
// including units outside every planner, since those are real seats the estimator missed.
// ============================================================

import type { ScrapedCourseListItem } from '../../../shared/types/student';
import { parseTermCode, type ParsedTerm } from '../termCode';

export interface TargetSemester {
  year: number;
  semester: 1 | 2;
}

export interface CutoffView {
  /** The transcript as it stood while the semester before the target was running. */
  history: ScrapedCourseListItem[];
  /** Unit codes the student actually enrolled in during the target semester, MPU excluded. */
  actual: string[];
  /**
   * False when the student has nothing before the target: they started in it, which makes them new intake,
   * the figure the HoD types by hand rather than something the estimator predicts from a transcript.
   */
  hasHistory: boolean;
  /**
   * Enrolled in the semester before the target, which is the semester running when the prediction is made.
   * A real scrape only ever contains these students, so only these are scored.
   */
  activeInPrevious: boolean;
  /**
   * The transcript has anything at or after the target. Without it there is no way to tell a student who
   * left from one whose record simply ends before the target, so they cannot be scored either way.
   */
  reachesTarget: boolean;
}

/**
 * Where a term sits in time. Semester months are normalised because the same semester is written with
 * different months depending on intake: 2024_FEB_S1 and 2025_MAR_S1 are both semester 1. Short terms keep
 * their real month, which places a June winter term between the two semesters as it should.
 */
function position(term: ParsedTerm): number {
  const month = term.kind === 'semester' ? (term.term === 1 ? 3 : 9) : term.month;
  return term.year * 12 + month;
}

function semesterPosition(target: TargetSemester): number {
  return target.year * 12 + (target.semester === 1 ? 3 : 9);
}

/** The semester running when a prediction for the target is made. */
export function previousSemester(target: TargetSemester): TargetSemester {
  return target.semester === 1
    ? { year: target.year - 1, semester: 2 }
    : { year: target.year, semester: 1 };
}

function isSemester(term: ParsedTerm, semester: TargetSemester): boolean {
  return term.kind === 'semester' && term.year === semester.year && term.term === semester.semester;
}

const isMpu = (code: string) => /^MPU/i.test(code.trim());

/** A scheduled row is a booking, not an enrolment that has happened yet. */
const isEnrolled = (row: ScrapedCourseListItem) => !/^schedul/i.test(String(row.status ?? '').trim());

/** A row as it looked while its semester was still running. */
function asInProgress(row: ScrapedCourseListItem): ScrapedCourseListItem {
  return { ...row, status: 'Current', grade: '', creditsEarned: 0 } as ScrapedCourseListItem;
}

export function cutTranscriptAt(transcript: ScrapedCourseListItem[], target: TargetSemester): CutoffView {
  const previous = previousSemester(target);
  const previousStart = semesterPosition(previous);

  const history: ScrapedCourseListItem[] = [];
  const actual = new Set<string>();
  let activeInPrevious = false;
  let reachesTarget = false;
  const targetStart = semesterPosition(target);

  for (const row of transcript) {
    const term = parseTermCode(String(row.term ?? ''));

    // A row with no readable term is usually an exemption or credit transfer, which is part of what the
    // student had behind them, so it stays in the history rather than being guessed into a semester.
    if (!term) {
      history.push(row);
      continue;
    }

    const at = position(term);
    if (at >= targetStart) reachesTarget = true;

    // A booking in the target counts as part of the answer. It is what the student had lined up to take,
    // and it never reaches the history side, so the estimator cannot read it off the transcript.
    if (isSemester(term, target)) {
      const code = String(row.courseId ?? '').trim().toUpperCase();
      if (code && !isMpu(code)) actual.add(code);
      continue;
    }

    if (at < previousStart) {
      history.push(row);
    } else if (isSemester(term, previous)) {
      if (isEnrolled(row)) activeInPrevious = true;
      history.push(asInProgress(row));
    }
    // Anything else falls between the previous semester and the target, or after the target: it had not
    // happened when the prediction was made, so it is left out.
  }

  return {
    history,
    actual: [...actual].sort(),
    hasHistory: history.some((row) => parseTermCode(String(row.term ?? '')) !== null),
    activeInPrevious,
    reachesTarget,
  };
}

/**
 * The teaching semesters a set of transcripts actually has enrolments in, oldest first. Used to offer only
 * targets that have an answer to compare against.
 */
export function semestersWithEnrolments(transcripts: ScrapedCourseListItem[][]): TargetSemester[] {
  const seen = new Map<string, TargetSemester>();
  for (const transcript of transcripts) {
    for (const row of transcript) {
      const term = parseTermCode(String(row.term ?? ''));
      if (!term || term.kind !== 'semester' || !isEnrolled(row)) continue;
      const semester = { year: term.year, semester: term.term as 1 | 2 };
      seen.set(`${semester.year}-${semester.semester}`, semester);
    }
  }
  return [...seen.values()].sort((a, b) => semesterPosition(a) - semesterPosition(b));
}
