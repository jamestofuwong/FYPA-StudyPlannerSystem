/**
 * Swinburne grade classification, 2018 scale onwards.
 *
 * Pass and fail codes are allowlists, not "anything that isn't N". There are
 * two fail codes, N and SN. Never infer pass/fail from a mark: CP (a Conceded
 * Pass) and the top band of N (a fail) both sit at 45-49, so only the code is
 * authoritative. Unrecognised codes return 'ungraded' rather than 'fail', which
 * is the safe default; findGradeCreditAnomalies surfaces them.
 */

import type { ScrapedCourseListItem } from '../types/student';

/** Grade codes that earn credit. Includes CP, see CONCEDED_PASS_GRADES. */
export const PASS_GRADES: ReadonlySet<string> = new Set(['HD', 'D', 'C', 'P', 'CP', 'SP']);

/**
 * Conceded Pass earns credit but "cannot satisfy Pre-requisite and Outcome
 * units", and an undergraduate may graduate with at most ONE (Swinburne
 * Conceded Pass form, Version 5, May 2023).
 */
export const CONCEDED_PASS_GRADES: ReadonlySet<string> = new Set(['CP']);

/** Grade codes that count as a fail. Note SN as well as N. */
export const FAIL_GRADES: ReadonlySet<string> = new Set(['N', 'SN']);

/** Regulation cap on Conceded Passes for an undergraduate award. */
export const MAX_CONCEDED_PASSES = 1;

/** How a single grade code classifies. */
export type GradeOutcome = 'pass' | 'conceded_pass' | 'fail' | 'ungraded';

/**
 * What a unit means for planning purposes, once grade and
 * enrolment status are combined.
 */
export type UnitState = 'passed' | 'in_progress' | 'must_retake' | 'not_taken';

/** A transcript row, loosely typed so `any[]` MPU lists can be passed too. */
type TranscriptRow = Partial<ScrapedCourseListItem>;

/** Trim and uppercase a grade code. Nullish becomes ''. */
export function normaliseGrade(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

/** Trim and uppercase a unit code. Nullish becomes ''. */
export function normaliseUnitCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

/**
 * Classify a raw grade code. Allowlist based. Anything unrecognised
 * returns 'ungraded' rather than 'fail'.
 */
export function classifyGrade(raw: string | null | undefined): GradeOutcome {
  const grade = normaliseGrade(raw);
  if (CONCEDED_PASS_GRADES.has(grade)) return 'conceded_pass';
  if (PASS_GRADES.has(grade)) return 'pass';
  if (FAIL_GRADES.has(grade)) return 'fail';
  return 'ungraded';
}

/** True for any credit-bearing grade, Conceded Pass included. */
export function isPassingGrade(raw: string | null | undefined): boolean {
  const outcome = classifyGrade(raw);
  return outcome === 'pass' || outcome === 'conceded_pass';
}

export function isFailingGrade(raw: string | null | undefined): boolean {
  return classifyGrade(raw) === 'fail';
}

/**
 * Best outcome wins: a later pass supersedes an earlier fail, and a full pass
 * supersedes a Conceded Pass on the same unit.
 */
const OUTCOME_PRECEDENCE: Record<GradeOutcome, number> = {
  pass: 4,
  conceded_pass: 3,
  ungraded: 2,
  fail: 1,
};

/** Best state wins, on the same principle. */
const STATE_PRECEDENCE: Record<UnitState, number> = {
  passed: 4,
  in_progress: 3,
  must_retake: 2,
  not_taken: 1,
};

/**
 * Resolve the grade outcome of every unit in a transcript, keyed on the
 * normalised unit code.
 *
 * A supplementary attempt produces TWO rows for the same unit (N then SP,
 * or N then SN), so resolution is per unit code, not per row: the best
 * outcome wins with precedence pass > conceded_pass > ungraded > fail. Row
 * order therefore does not affect the result.
 *
 * Rows with a blank courseId are skipped; a nullish array yields an empty map.
 */
export function resolveUnitOutcomes(
  rows: ReadonlyArray<TranscriptRow> | null | undefined,
): Map<string, GradeOutcome> {
  const outcomes = new Map<string, GradeOutcome>();
  for (const row of rows ?? []) {
    const code = normaliseUnitCode(row?.courseId);
    if (!code) continue;
    const outcome = classifyGrade(row?.grade);
    const existing = outcomes.get(code);
    if (existing === undefined || OUTCOME_PRECEDENCE[outcome] > OUTCOME_PRECEDENCE[existing]) {
      outcomes.set(code, outcome);
    }
  }
  return outcomes;
}

/**
 * Resolve the planning state of every unit in a transcript, combining the
 * grade code with the enrolment status:
 *
 *   grade is a pass              -> 'passed'
 *   grade is a Conceded Pass     -> 'passed'  (credit earned, so it is not
 *                                   rescheduled; see getConcededPassUnitCodes
 *                                   for the prerequisite restriction)
 *   grade is a fail              -> 'must_retake'
 *   ungraded + status 'Current'  -> 'in_progress'
 *   ungraded + status 'Complete' -> 'passed'  (credit transfer, exemption or
 *                                   an unmapped code, treated as done rather
 *                                   than silently dropped)
 *   otherwise (incl. 'Future')   -> 'not_taken'
 *
 * Resolved per unit code with best state winning, precedence
 * passed > in_progress > must_retake > not_taken.
 */
export function resolveUnitStates(
  rows: ReadonlyArray<TranscriptRow> | null | undefined,
): Map<string, UnitState> {
  const states = new Map<string, UnitState>();
  for (const row of rows ?? []) {
    const code = normaliseUnitCode(row?.courseId);
    if (!code) continue;

    const outcome = classifyGrade(row?.grade);
    const status = (row?.status ?? '').trim();

    let state: UnitState;
    if (outcome === 'pass' || outcome === 'conceded_pass') state = 'passed';
    else if (outcome === 'fail') state = 'must_retake';
    else if (status === 'Current') state = 'in_progress';
    else if (status === 'Complete') state = 'passed';
    else state = 'not_taken';

    const existing = states.get(code);
    if (existing === undefined || STATE_PRECEDENCE[state] > STATE_PRECEDENCE[existing]) {
      states.set(code, state);
    }
  }
  return states;
}

/**
 * Unit codes the student does not need scheduled: already passed, or
 * currently enrolled. Failed units and Future pre-enrollments are excluded
 * so the scheduler can (re)place them.
 */
export function getCompletedUnitCodes(
  rows: ReadonlyArray<TranscriptRow> | null | undefined,
): string[] {
  const codes: string[] = [];
  for (const [code, state] of resolveUnitStates(rows)) {
    if (state === 'passed' || state === 'in_progress') codes.push(code);
  }
  return codes;
}

/** Unit codes the student attempted and failed, and has not since passed. */
export function getFailedUnitCodes(
  rows: ReadonlyArray<TranscriptRow> | null | undefined,
): string[] {
  const codes: string[] = [];
  for (const [code, state] of resolveUnitStates(rows)) {
    if (state === 'must_retake') codes.push(code);
  }
  return codes;
}

/**
 * Units whose best result is a Conceded Pass. They count as completed and
 * earn credit, but must not satisfy a prerequisite. A unit later passed
 * outright is not included.
 */
export function getConcededPassUnitCodes(
  rows: ReadonlyArray<TranscriptRow> | null | undefined,
): string[] {
  const codes: string[] = [];
  for (const [code, outcome] of resolveUnitOutcomes(rows)) {
    if (outcome === 'conceded_pass') codes.push(code);
  }
  return codes;
}

export type GradeCreditAnomaly = {
  code: string;
  grade: string;
  creditsEarned: number;
  reason: string;
};

/**
 * Cross-check each row's grade against the credit it earned. A passing grade
 * should earn credit; a failing grade should earn none. Rows that disagree
 * usually mean a grade code outside the 2018 scale is in play.
 *
 * Also flags every Conceded Pass when the transcript holds more than
 * MAX_CONCEDED_PASSES of them, since the regulation caps it for graduation.
 */
export function findGradeCreditAnomalies(
  rows: ReadonlyArray<TranscriptRow> | null | undefined,
): GradeCreditAnomaly[] {
  const anomalies: GradeCreditAnomaly[] = [];
  for (const row of rows ?? []) {
    const code = normaliseUnitCode(row?.courseId);
    if (!code) continue;

    const grade = normaliseGrade(row?.grade);
    const creditsEarned = Number(row?.creditsEarned ?? 0) || 0;
    const outcome = classifyGrade(grade);

    if ((outcome === 'pass' || outcome === 'conceded_pass') && creditsEarned === 0) {
      anomalies.push({ code, grade, creditsEarned, reason: 'passing grade earned no credit' });
    } else if (outcome === 'fail' && creditsEarned > 0) {
      anomalies.push({ code, grade, creditsEarned, reason: 'failing grade earned credit' });
    } else if (outcome === 'ungraded' && grade !== '' && creditsEarned > 0) {
      anomalies.push({
        code,
        grade,
        creditsEarned,
        reason: 'grade code is not in the 2018 scale but earned credit',
      });
    }
  }

  const concededPassCodes = new Set(getConcededPassUnitCodes(rows));
  if (concededPassCodes.size > MAX_CONCEDED_PASSES) {
    const flagged = new Set<string>();
    for (const row of rows ?? []) {
      const code = normaliseUnitCode(row?.courseId);
      if (!concededPassCodes.has(code) || flagged.has(code)) continue;
      if (classifyGrade(row?.grade) !== 'conceded_pass') continue;
      flagged.add(code);
      anomalies.push({
        code,
        grade: normaliseGrade(row?.grade),
        creditsEarned: Number(row?.creditsEarned ?? 0) || 0,
        reason: `${concededPassCodes.size} Conceded Passes, but an undergraduate may graduate with at most ${MAX_CONCEDED_PASSES}`,
      });
    }
  }
  return anomalies;
}
