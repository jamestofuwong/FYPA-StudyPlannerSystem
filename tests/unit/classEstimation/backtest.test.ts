// ============================================================
// Tests for the Phase 10 accuracy backtest: the transcript cut and the metrics.
//
// The cut matters most. A backtest that lets the answer leak into the question scores itself well for the
// wrong reason, and nothing downstream would notice. So the tests below are mostly about what the estimator
// is NOT allowed to see: the target semester's rows, and the grades of the semester still running when the
// prediction is made.
// ============================================================

import {
  cutTranscriptAt,
  previousSemester,
  semestersWithEnrolments,
} from '@core/services/classEstimation/backtest/transcriptCutoff';
import {
  compareByUnit,
  summariseAccuracy,
  studentOverlap,
  gradeAccuracy,
} from '@core/services/classEstimation/backtest/accuracyMetrics';
import type { ScrapedCourseListItem } from '@shared/types/student';

function row(code: string, term: string, status = 'Complete', grade = 'D', earned = 12.5): ScrapedCourseListItem {
  return {
    courseId: code, courseTitle: code, level: '', credits: 12.5, creditsEarned: earned, status, grade, term,
  } as ScrapedCourseListItem;
}

const target = { year: 2026, semester: 1 as const };

describe('previousSemester', () => {
  test('semester 1 follows semester 2 of the year before', () => {
    expect(previousSemester({ year: 2026, semester: 1 })).toEqual({ year: 2025, semester: 2 });
  });
  test('semester 2 follows semester 1 of the same year', () => {
    expect(previousSemester({ year: 2026, semester: 2 })).toEqual({ year: 2026, semester: 1 });
  });
});

describe('cutTranscriptAt', () => {
  const transcript = [
    row('COS10009', '2025_MAR_S1'),                        // finished before
    row('COS10004', '2025_SEP_S2', 'Complete', 'N', 0),   // the semester running at prediction time, failed
    row('COS20007', '2025_SEP_S2', 'Complete', 'HD'),
    row('WIL00001', '2026_JAN_ST'),                        // a summer term after it
    row('COS30049', '2026_MAR_S1'),                        // the target
    row('MPU3193', '2026_MAR_S1'),
    row('COS40005', '2026_SEP_S2'),                        // after the target
  ];

  const cut = cutTranscriptAt(transcript, target);
  const inHistory = (code: string) => cut.history.find((r) => r.courseId === code);

  test('the target semester is the answer, not part of the history', () => {
    expect(cut.actual).toEqual(['COS30049']);
    expect(inHistory('COS30049')).toBeUndefined();
  });

  // The leak that would flatter the result most. At prediction time the failure had not happened yet, so
  // seeing it would let the estimator "predict" a retake it could not have foreseen.
  test('the semester still running is in progress: no grade, no credit', () => {
    expect(inHistory('COS10004')).toMatchObject({ status: 'Current', grade: '', creditsEarned: 0 });
    expect(inHistory('COS20007')).toMatchObject({ status: 'Current', grade: '', creditsEarned: 0 });
  });

  test('earlier semesters keep their real grades', () => {
    expect(inHistory('COS10009')).toMatchObject({ status: 'Complete', grade: 'D', creditsEarned: 12.5 });
  });

  test('a short term between the running semester and the target had not happened yet', () => {
    expect(inHistory('WIL00001')).toBeUndefined();
  });

  test('anything after the target is dropped', () => {
    expect(inHistory('COS40005')).toBeUndefined();
    expect(cut.actual).not.toContain('COS40005');
  });

  // The estimator never predicts MPU units, so scoring it on them would score it on nothing it was asked.
  test('MPU units are not part of the answer', () => {
    expect(cut.actual).not.toContain('MPU3193');
  });

  test('flags a student as active in the running semester and reaching the target', () => {
    expect(cut.hasHistory).toBe(true);
    expect(cut.activeInPrevious).toBe(true);
    expect(cut.reachesTarget).toBe(true);
  });

  // The same semester is written with different months depending on intake.
  test('FEB and MAR both count as semester 1, AUG and SEP both as semester 2', () => {
    const view = cutTranscriptAt([
      row('A', '2025_AUG_S2'),
      row('B', '2026_FEB_S1'),
      row('C', '2026_MAR_S1'),
    ], target);
    expect(view.actual).toEqual(['B', 'C']);
    expect(view.activeInPrevious).toBe(true);
  });

  test('a booking in the target counts as part of the answer', () => {
    const view = cutTranscriptAt([row('A', '2025_SEP_S2'), row('B', '2026_MAR_S1', 'Scheduled', '', 0)], target);
    expect(view.actual).toEqual(['B']);
  });

  test('a student who starts in the target has no history, which makes them new intake', () => {
    const view = cutTranscriptAt([row('A', '2026_MAR_S1')], target);
    expect(view.hasHistory).toBe(false);
    expect(view.actual).toEqual(['A']);
  });

  // A real scrape only holds students enrolled at the time, so these are not scored.
  test('a student not enrolled in the running semester is not active', () => {
    const view = cutTranscriptAt([row('A', '2025_MAR_S1'), row('B', '2026_MAR_S1')], target);
    expect(view.activeInPrevious).toBe(false);
  });

  test('a record that stops before the target does not reach it', () => {
    const view = cutTranscriptAt([row('A', '2025_SEP_S2')], target);
    expect(view.activeInPrevious).toBe(true);
    expect(view.reachesTarget).toBe(false);
  });

  test('a row with no readable term stays in the history, as an exemption or transfer would', () => {
    const view = cutTranscriptAt([row('EXEMPT', ''), row('A', '2025_SEP_S2')], target);
    expect(view.history.map((r) => r.courseId)).toContain('EXEMPT');
  });
});

describe('semestersWithEnrolments', () => {
  test('lists the teaching semesters with enrolments, oldest first, ignoring short terms and bookings', () => {
    const semesters = semestersWithEnrolments([
      [row('A', '2025_SEP_S2'), row('B', '2025_MAR_S1'), row('W', '2026_JUN_WT')],
      [row('C', '2026_MAR_S1'), row('D', '2026_SEP_S2', 'Scheduled')],
    ]);
    expect(semesters).toEqual([
      { year: 2025, semester: 1 },
      { year: 2025, semester: 2 },
      { year: 2026, semester: 1 },
    ]);
  });
});

// ====== Metrics ================================================================================

describe('summariseAccuracy', () => {
  const rows = (pairs: Array<[string, number, number]>) =>
    compareByUnit(new Map(pairs.map(([c, p]) => [c, p])), new Map(pairs.map(([c, , a]) => [c, a])));

  test('a perfect prediction scores 100%', () => {
    const summary = summariseAccuracy(rows([['A', 10, 10], ['B', 5, 5]]));
    expect(summary.accuracy).toBe(1);
    expect(summary.wape).toBe(0);
    expect(summary.withinTolerance).toBe(1);
  });

  // WAPE weights by class size, so a big miss on a big class costs what it should.
  test('accuracy is 1 minus the total miss over the total real enrolment', () => {
    const summary = summariseAccuracy(rows([['BIG', 180, 200], ['SMALL', 5, 3]]));
    // misses 20 + 2 = 22, real 203
    expect(summary.wape).toBeCloseTo(22 / 203, 10);
    expect(summary.accuracy).toBeCloseTo(1 - 22 / 203, 10);
  });

  test('misses in opposite directions do not cancel in the accuracy, but do in the bias', () => {
    const summary = summariseAccuracy(rows([['A', 15, 10], ['B', 5, 10]]));
    expect(summary.accuracy).toBeCloseTo(0.5, 10);
    expect(summary.bias).toBeCloseTo(0, 10);
  });

  test('accuracy never goes below zero', () => {
    expect(summariseAccuracy(rows([['A', 100, 10]])).accuracy).toBe(0);
  });

  test('bias is positive when the estimate runs high', () => {
    expect(summariseAccuracy(rows([['A', 12, 10]])).bias).toBeCloseTo(0.2, 10);
  });

  test('a unit counts as right when it lands within the tolerance of its real size', () => {
    const summary = summariseAccuracy(rows([['IN', 13, 10], ['OUT', 14, 10]]), 0.3);
    expect(summary.withinTolerance).toBe(0.5);
  });

  // Any percentage of zero is zero, so an empty class is only right when the prediction is empty too.
  test('a unit nobody took is right only if the prediction also rounds to nobody', () => {
    const summary = summariseAccuracy(rows([['EMPTY_OK', 0.3, 0], ['EMPTY_MISS', 2, 0]]));
    expect(summary.withinTolerance).toBe(0.5);
  });

  test('nothing enrolled at all reports zero rather than dividing by zero', () => {
    const summary = summariseAccuracy([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.bias).toBe(0);
    expect(summary.withinTolerance).toBe(0);
  });
});

describe('compareByUnit', () => {
  test('includes units on either side, largest real class first', () => {
    const rows = compareByUnit(new Map([['PRED_ONLY', 4], ['BOTH', 10]]), new Map([['BOTH', 20], ['REAL_ONLY', 5]]));
    expect(rows.map((r) => [r.code, r.predicted, r.actual, r.error])).toEqual([
      ['BOTH', 10, 20, -10],
      ['REAL_ONLY', 0, 5, -5],
      ['PRED_ONLY', 4, 0, 4],
    ]);
  });
});

describe('studentOverlap', () => {
  test('precision is over what was named, recall over what was taken', () => {
    const overlap = studentOverlap(['A', 'B', 'C', 'D'], ['A', 'B', 'E']);
    expect(overlap.hits).toBe(2);
    expect(overlap.precision).toBe(0.5);
    expect(overlap.recall).toBeCloseTo(2 / 3, 10);
  });

  test('an empty side scores zero rather than NaN', () => {
    expect(studentOverlap([], ['A'])).toEqual({ hits: 0, precision: 0, recall: 0 });
    expect(studentOverlap(['A'], [])).toEqual({ hits: 0, precision: 0, recall: 0 });
  });

  test('codes are compared regardless of case and spacing', () => {
    expect(studentOverlap([' cos10009'], ['COS10009 ']).hits).toBe(1);
  });
});

describe('gradeAccuracy', () => {
  test.each([
    [0.1, 'below target'],
    [0.3, 'acceptable'],
    [0.69, 'acceptable'],
    [0.7, 'excellent'],
  ])('%p is %p', (accuracy, grade) => {
    expect(gradeAccuracy(accuracy)).toBe(grade);
  });
});
