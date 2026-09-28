// ============================================================
// Phase 10. Runs the whole estimator against a past semester and scores it against what really happened.
//
// Every student's transcript is cut at the target (transcriptCutoff.ts), rebuilt into a record exactly as an
// import would build one, and put through the same preview the dashboard runs. Nothing about the estimator
// is special-cased for testing, so what is measured is what ships.
//
// Two settings are forced, and both are about fairness rather than convenience:
//
//   Retention is 1. The transcripts only contain students still on record when they were exported, so
//   anyone who dropped out never appears on either side. Discounting the prediction for dropouts the actual
//   figure cannot contain would make the estimate look worse than it is. The flip side is that this backtest
//   says nothing about whether the retention rate itself is right, which is reported with every result.
//
//   New intake is 0, and students who started in the target semester are left out of the actual figure. They
//   are the number the HoD types by hand, not something predicted from a transcript, so scoring the
//   estimator on them would be scoring it on an input.
// ============================================================

import { buildEstimationRecord } from '../estimationRecordBuilder';
import { getCachedPlannerById } from '../plannerCache';
import { runEstimationPreview } from '../estimationPreview';
import { DEFAULT_CLASS_ESTIMATION_CONFIG, type EstimationRecord } from '../../../shared/types/classEstimation';
import { cutTranscriptAt, type TargetSemester } from './transcriptCutoff';
import {
  compareByUnit,
  summariseAccuracy,
  studentOverlap,
  gradeAccuracy,
  type AccuracySummary,
  type UnitComparison,
} from './accuracyMetrics';

export interface BacktestOptions {
  target: TargetSemester;
  loadCap?: number;
  /** How close a single unit has to land to count as right, as a share of its real size. */
  tolerance?: number;
}

export interface BacktestResult {
  target: TargetSemester;
  students: {
    /** Enrolled in the semester before the target with a record reaching it: predicted and scored. */
    included: number;
    /** Students who started in the target semester, left out as new intake. */
    newIntake: number;
    /** Not enrolled in the semester before the target, so a scrape at the time would not have held them. */
    notActive: number;
    /** Enrolled before the target but their record stops there, so whether they came back is unknown. */
    outcomeUnknown: number;
    /** Scored students with no enrolment in the target despite a record past it: a break. */
    notEnrolledInTarget: number;
  };
  summary: AccuracySummary;
  grade: ReturnType<typeof gradeAccuracy>;
  /** Every unit on either side, largest real class first. */
  units: UnitComparison[];
  /** Averages over included students who did enrol in the target. See accuracyMetrics.ts. */
  studentRecall: number;
  studentPrecision: number;
  /**
   * Of every real enrolment, the share where the estimator put at least some weight on that unit for that
   * student, as a named pick or an elective share. The ceiling any refinement of the weighting could reach.
   */
  coverage: number;
  /**
   * Every real enrolment, sorted into why it was or was not predicted. This is what points at the part of
   * the estimator worth improving, since the headline figure alone cannot say where the error comes from.
   */
  enrolmentOutcomes: Record<EnrolmentOutcome, number>;
  /** What this result can and cannot tell you, so it is never read without its limits. */
  notes: string[];
}

export type EnrolmentOutcome =
  | 'named pick'
  | 'elective share'
  | 'eligible, other units picked first'
  | 'requisites unmet'
  | 'not offered that semester'
  | 'not in the detected planner'
  | 'no major detected, not shared core'
  | 'not estimated';

function emptyOutcomes(): Record<EnrolmentOutcome, number> {
  return {
    'named pick': 0,
    'elective share': 0,
    'eligible, other units picked first': 0,
    'requisites unmet': 0,
    'not offered that semester': 0,
    'not in the detected planner': 0,
    'no major detected, not shared core': 0,
    'not estimated': 0,
  };
}

/** Every unit a planner holds, slotted or in an elective pool. */
async function plannerCodes(plannerId: string): Promise<Set<string>> {
  const planner = await getCachedPlannerById(plannerId);
  const codes = new Set<string>();
  for (const templateUnit of planner?.units ?? []) {
    if (templateUnit.unit) codes.add(templateUnit.unit.unit_code);
  }
  for (const group of planner?.elective_groups ?? []) {
    for (const member of group.units) codes.add(member.unit.unit_code);
  }
  return codes;
}

export async function runBacktest(records: EstimationRecord[], options: BacktestOptions): Promise<BacktestResult> {
  const { target } = options;
  const loadCap = options.loadCap ?? DEFAULT_CLASS_ESTIMATION_CONFIG.loadCap;

  // The scored cohort is the one a real scrape would have held when the prediction was made: students
  // enrolled in the semester before the target. And only those whose record reaches the target, since a
  // record that stops earlier cannot say whether the student left or was simply exported before the target.
  // Generated students each stop at their own point in time, so without this a cohort of 500 scores
  // hundreds of students as having vanished and every prediction for them as a miss.
  const cuts = records.map((record) => ({ record, cut: cutTranscriptAt(record.transcript, target) }));
  const withHistory = cuts.filter(({ cut }) => cut.hasHistory);
  const included = withHistory.filter(({ cut }) => cut.activeInPrevious && cut.reachesTarget);
  const newIntake = cuts.filter(({ cut }) => !cut.hasHistory && cut.actual.length > 0).length;
  const notActive = withHistory.filter(({ cut }) => !cut.activeInPrevious).length;
  const outcomeUnknown = withHistory.filter(({ cut }) => cut.activeInPrevious && !cut.reachesTarget).length;

  const rebuilt = included.map(({ record, cut }) =>
    buildEstimationRecord({
      source: record.source,
      studentId: record.studentId,
      name: record.name,
      transcript: cut.history,
      config: { ...DEFAULT_CLASS_ESTIMATION_CONFIG, loadCap },
    }),
  );

  const preview = await runEstimationPreview(rebuilt, {
    targetTerm: target.semester,
    targetYear: target.year,
    loadCap,
    retentionRate: 1,
    newIntakeCount: 0,
  });

  // ---- Per unit ---------------------------------------------------------------------------------
  const predicted = new Map(preview.summary.projectedByUnit.map((unit) => [unit.code, unit.projected]));
  const actual = new Map<string, number>();
  for (const { cut } of included) {
    for (const code of cut.actual) actual.set(code, (actual.get(code) ?? 0) + 1);
  }

  const units = compareByUnit(predicted, actual);
  const summary = summariseAccuracy(units, options.tolerance ?? 0.3);

  // ---- Per student ------------------------------------------------------------------------------
  const previewById = new Map(preview.students.map((student) => [student.studentId, student]));
  let recallSum = 0;
  let precisionSum = 0;
  let scored = 0;
  let enrolments = 0;
  let covered = 0;
  let notEnrolled = 0;
  const outcomes = emptyOutcomes();

  for (const { record, cut } of included) {
    if (cut.actual.length === 0) { notEnrolled++; continue; }
    const student = previewById.get(record.studentId);
    const named = student?.picked.map((unit) => unit.code) ?? [];
    const overlap = studentOverlap(named, cut.actual);
    recallSum += overlap.recall;
    precisionSum += overlap.precision;
    scored++;

    const weighted = new Set([
      ...named,
      ...(student?.electives.filter((e) => e.expectedSeats > 0).map((e) => e.code) ?? []),
    ]);
    enrolments += cut.actual.length;
    covered += cut.actual.filter((code) => weighted.has(code)).length;

    // Checked in the order the estimator itself decides things, so each enrolment lands on the first step
    // that lost it.
    const picked = new Set(named);
    const shares = new Set(student?.electives.filter((e) => e.expectedSeats > 0).map((e) => e.code) ?? []);
    const ineligible = new Map(student?.ineligible.map((unit) => [unit.code, unit.reason]) ?? []);
    const inPlanner = student?.planner ? await plannerCodes(student.planner.id) : new Set<string>();

    for (const code of cut.actual) {
      const reason = ineligible.get(code);
      if (picked.has(code)) outcomes['named pick']++;
      else if (shares.has(code)) outcomes['elective share']++;
      else if (reason === 'requisites-unmet') outcomes['requisites unmet']++;
      else if (reason === 'not-offered-in-term') outcomes['not offered that semester']++;
      else if (student?.basis === 'commonCore') outcomes['no major detected, not shared core']++;
      else if (!student?.planner) outcomes['not estimated']++;
      else if (!inPlanner.has(code)) outcomes['not in the detected planner']++;
      else outcomes['eligible, other units picked first']++;
    }
  }

  const notes = [
    'Only students enrolled in the semester before the target are scored, since those are the students a '
      + 'scrape at the time would have held, and only if their record reaches the target.',
    'Retention is fixed at 100%: a student whose record stops is not scored, so dropouts appear on neither '
      + 'side. This measures who takes what, not whether the retention rate is right.',
    'Students who started in the target semester are left out, since new intake is typed in by hand.',
    'The prediction is made as if during the semester before the target, so that semester\'s grades and '
      + 'credits are hidden, as they would have been at the time.',
  ];
  if (records.some((record) => record.source === 'mock')) {
    notes.unshift(
      'Generated data. The mock generator builds transcripts by following the planners, so part of this '
        + 'score is the estimator recovering the generator\'s own logic. It also ignores prerequisites, so '
        + 'its students take units the real portal would block, which shows up as "requisites unmet" misses. '
        + 'It catches bugs; real DPA exports are what give a meaningful accuracy figure.',
    );
  }

  return {
    target,
    students: { included: included.length, newIntake, notActive, outcomeUnknown, notEnrolledInTarget: notEnrolled },
    summary,
    grade: gradeAccuracy(summary.accuracy),
    units,
    studentRecall: scored > 0 ? recallSum / scored : 0,
    studentPrecision: scored > 0 ? precisionSum / scored : 0,
    coverage: enrolments > 0 ? covered / enrolments : 0,
    enrolmentOutcomes: outcomes,
    notes,
  };
}
