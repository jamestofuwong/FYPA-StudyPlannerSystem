// ============================================================
// Builds an EstimationRecord from a transcript, whatever produced it.
//
// The portal scrape is how the client works at scale, and DPA file import covers cases where portal 
// access is unavailable. So this is the single place a transcript becomes a record, and everything downstream
// sees only EstimationRecord. The source is recorded for reporting and tracing, never branched on, which
// is what stops the two paths drifting apart.
//
// Four things a transcript says that were previously guessed or ignored are read here:
//   - intake, from the earliest term code rather than an ambiguous enrolment date
//   - credit points, summed from the Earned column rather than counting units at a flat 12.5
//   - WIL, detected from the transcript rather than defaulted for every student alike
//   - already-booked units, captured for measurement
// ============================================================

import type { ScrapedCourseListItem, ScrapedStudent } from '../../shared/types/student';
import {
  DEFAULT_CLASS_ESTIMATION_CONFIG,
  type ClassEstimationConfig,
  type EstimationRecord,
  type EstimationSource,
  type ScheduledUnitRow,
} from '../../shared/types/classEstimation';
import {
  getConcededPassUnitCodes,
  normaliseUnitCode,
  resolveUnitStates,
} from '../../shared/constants/grades';
import { mapScrapedStudentToRawInput } from './scrapedStudentMapper';

// Matches CREDIT_POINTS_PER_UNIT in customPlannerScheduler.ts. Only used as a stand-in when a transcript
// carries no credit figures at all.
const FLAT_CREDIT_POINTS_PER_UNIT = 12.5;

export interface BuildEstimationRecordInput {
  source: EstimationSource;
  studentId: string;
  transcript: ScrapedCourseListItem[];
  /** Falls back to the student ID, so an imported transcript with no name still reads sensibly. */
  name?: string;
  /** Portal only. */
  dbId?: number;
  enrollId?: number;
  scraped?: ScrapedStudent;
  config?: ClassEstimationConfig;
  /**
   * Rewrites unit codes that mean the same requirement under different codes, e.g. a planner asking for
   * ICT20016 against a transcript showing ICT20026. Keys and values are matched uppercased.
   */
  unitCodeAliases?: Record<string, string>;
}

/**
 * Titles that identify a Work Integrated Learning placement. Matching on the title rather than the code
 * matters: a real placement code is ICT20026, which contains no "WIL" substring, so a code-based check
 * (as the copilot workflow still uses) misses it entirely.
 */
const WIL_TITLE_PATTERNS = [/work[-\s]?integrated learning/i, /\bWIL\b/];

function isWilRow(row: ScrapedCourseListItem): boolean {
  const title = row.courseTitle ?? '';
  return WIL_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/** Applies the alias map, reporting every rewrite so a wrong alias shows up instead of silently passing. */
function applyAliases(
  transcript: ScrapedCourseListItem[],
  aliases: Record<string, string>,
): { transcript: ScrapedCourseListItem[]; applied: Array<[string, string]> } {
  const entries = Object.entries(aliases);
  if (entries.length === 0) return { transcript, applied: [] };

  const lookup = new Map(entries.map(([from, to]) => [normaliseUnitCode(from), normaliseUnitCode(to)]));
  const applied: Array<[string, string]> = [];

  const rewritten = transcript.map((row) => {
    const code = normaliseUnitCode(row.courseId);
    const target = lookup.get(code);
    if (!target || target === code) return row;
    applied.push([code, target]);
    return { ...row, courseId: target };
  });

  return { transcript: rewritten, applied };
}

/**
 * Credit points actually earned from the transcript's own Earned column.
 *
 * A count of completed units times 12.5 is wrong in both directions on a real transcript: the academic
 * integrity module carries 0 credits but counts as passed, and a WIL placement carries 25. Credit-point
 * requisites such as "150cp before the capstone" depend on this being right, and were previously
 * evaluated against a number that could be out by a whole unit or more.
 */
/**
 * Whether the transcript carries credit figures at all. This separates "earned nothing" from "nobody
 * recorded the credits", which a zero total cannot distinguish on its own. Guessing on behalf of the first
 * case would hand phantom credits to a student who genuinely holds none, and refusing to guess on the
 * second would fail every credit-point gate for a whole cohort.
 */
export function hasCreditData(transcript: ScrapedCourseListItem[]): boolean {
  return transcript.some((row) => (Number(row?.credits) || 0) > 0 || (Number(row?.creditsEarned) || 0) > 0);
}

export function sumCreditsEarned(transcript: ScrapedCourseListItem[]): number {
  const states = resolveUnitStates(transcript);

  // A retaken unit appears more than once, as a failed attempt earning nothing and a later pass earning
  // full credit. Take the best row per code, not the first, or a student who failed once then passed would
  // be credited zero for a unit they hold.
  const bestPerCode = new Map<string, number>();
  for (const row of transcript) {
    const code = normaliseUnitCode(row?.courseId);
    if (!code) continue;
    // Only units that earned credit count. A failed or in-progress unit reports 0 earned anyway, but
    // checking the resolved state keeps this correct if a transcript ever disagrees with itself.
    if (states.get(code) !== 'passed') continue;
    const earned = Number(row.creditsEarned) || 0;
    bestPerCode.set(code, Math.max(bestPerCode.get(code) ?? 0, earned));
  }

  let total = 0;
  for (const earned of bestPerCode.values()) total += earned;
  return total;
}

/** Units already enrolled in for a future term, captured for measurement rather than prediction. */
export function collectScheduledUnits(transcript: ScrapedCourseListItem[]): ScheduledUnitRow[] {
  return transcript
    .filter((row) => (row?.status ?? '').trim().toLowerCase() === 'scheduled')
    .map((row) => ({ code: normaliseUnitCode(row.courseId), term: (row.term ?? '').trim() }))
    .filter((row) => row.code);
}

export function buildEstimationRecord(input: BuildEstimationRecordInput): EstimationRecord {
  const config = input.config ?? DEFAULT_CLASS_ESTIMATION_CONFIG;
  const { transcript, applied } = applyAliases(input.transcript ?? [], input.unitCodeAliases ?? {});

  // The rawInput mapper reads a ScrapedStudent. A portal record has a real one; an imported transcript
  // only has rows, so the fields the mapper actually uses are supplied and the rest left empty rather than
  // invented. Nothing downstream reads the placeholder values.
  const scrapedForMapping: ScrapedStudent = input.scraped
    ? { ...input.scraped, courseList: transcript }
    : {
        course: '', status: '', cgpa: 0, creditsRequired: 0, creditsCompleted: 0,
        gradeLevel: '', enrollmentDate: '', graduationDate: null, scheduledCredits: 0,
        courseList: transcript,
      };

  const { rawInput, warnings } = mapScrapedStudentToRawInput(scrapedForMapping, input.studentId, config);

  // WIL is detected from the transcript where possible. The config default only applies when the
  // transcript says nothing, which is the common case for a student who has not reached their placement
  // yet. This is not about counting placements, which are excluded from estimates by decision: it changes
  // how many free elective slots the matching algorithm requires, so getting it wrong shifts elective
  // demand for every student alike.
  const wilRow = transcript.find(isWilRow);
  const hasWIL = wilRow ? true : config.defaultHasWIL;
  const wilWarningIndex = warnings.findIndex((w) => w.startsWith('hasWIL defaulted'));
  if (wilRow) {
    if (wilWarningIndex >= 0) warnings.splice(wilWarningIndex, 1);
    warnings.push(`hasWIL detected from the transcript (${normaliseUnitCode(wilRow.courseId)})`);
  }

  for (const [from, to] of applied) {
    warnings.push(`unit code ${from} treated as ${to} via the alias map`);
  }

  // A transcript with no credit figures anywhere gets the flat-rate estimate the rest of the codebase
  // uses, rather than zero, which would fail every credit-point requisite for the whole cohort. Flagged,
  // because it is an estimate standing in for missing data.
  let totalCreditsEarned: number;
  if (hasCreditData(transcript)) {
    totalCreditsEarned = sumCreditsEarned(transcript);
  } else {
    const passed = [...resolveUnitStates(transcript).values()].filter((state) => state === 'passed').length;
    totalCreditsEarned = passed * FLAT_CREDIT_POINTS_PER_UNIT;
    if (transcript.length > 0) {
      warnings.push(`totalCreditsEarned estimated at ${totalCreditsEarned} from ${passed} passed units: the transcript carries no credit figures`);
    }
  }

  return {
    studentId: input.studentId,
    source: input.source,
    name: input.name ?? input.studentId,
    dbId: input.dbId,
    enrollId: input.enrollId,
    scraped: input.scraped ? { ...input.scraped, courseList: transcript } : undefined,
    transcript,
    rawInput: { ...rawInput, hasWIL },
    totalCreditsEarned,
    scheduledUnits: collectScheduledUnits(transcript),
    appliedAliases: applied,
    unitStates: resolveUnitStates(transcript),
    concededPassUnitCodes: getConcededPassUnitCodes(transcript),
    mappingWarnings: warnings,
  };
}
