// ============================================================
// Tests for core/services/classEstimation/backtest/backtestRunner.ts, run end to end through the real
// estimator with only the two repositories mocked, the same way estimation-preview.test.ts does it.
//
// Fixture planner, intake March 2025 (semester 1):
//   core  COS10009 (y1s1), COS10003 (y1s1), COS20007 (y1s2, needs COS10009), TNE10006 (y1s2)
// Target: semester 2 of 2025, so the prediction is made during semester 1 of 2025.
// ============================================================

import { runBacktest } from '@core/services/classEstimation/backtest/backtestRunner';
import { buildEstimationRecord } from '@core/services/classEstimation/estimationRecordBuilder';
import { resetPlannerCache } from '@core/services/classEstimation/plannerCache';
import * as plannerRepository from '@core/db/repositories/plannerRepository';
import * as unitRepository from '@core/db/repositories/unitRepository';
import type { ScrapedCourseListItem } from '@shared/types/student';

jest.mock('@core/db/repositories/plannerRepository');
jest.mock('@core/db/repositories/unitRepository');

const prereq = (code: string) => ({
  conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: code } }],
});

const dbUnit = (code: string, offered: number[], groups: unknown[] = []) => ({
  unit_code: code, unit_name: code, offerings: offered.map((offered_in) => ({ offered_in })), requisite_groups: groups,
});

function planner() {
  return {
    id: 'p1',
    major: { name: 'Software Development' },
    intake_year: 2025,
    intake_month: 3,
    course_type: 'degree',
    duration_semesters: 6,
    units: [
      { category: 'core', year_level: 1, semester: 1, unit: dbUnit('COS10009', [1, 2]) },
      { category: 'core', year_level: 1, semester: 1, unit: dbUnit('COS10003', [1, 2]) },
      { category: 'core', year_level: 1, semester: 2, unit: dbUnit('COS20007', [1, 2], [prereq('COS10009')]) },
      { category: 'core', year_level: 1, semester: 2, unit: dbUnit('TNE10006', [1, 2]) },
    ],
    elective_groups: [],
  };
}

function row(code: string, term: string, status = 'Complete', grade = 'D', earned = 12.5) {
  return {
    courseId: code, courseTitle: code, level: '', credits: 12.5, creditsEarned: earned, status, grade, term,
  } as ScrapedCourseListItem;
}

const record = (id: string, transcript: ScrapedCourseListItem[]) =>
  buildEstimationRecord({ source: 'import', studentId: id, transcript });

const target = { year: 2025, semester: 2 as const };

describe('runBacktest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlannerCache();
    const p = planner();
    jest.mocked(plannerRepository.getAllPlannersWithUnits).mockResolvedValue([p] as never);
    jest.mocked(plannerRepository.getPlannerById).mockResolvedValue(p as never);
    jest.mocked(unitRepository.getAllUnits).mockResolvedValue(
      p.units.map((u) => ({ unit_code: u.unit.unit_code, unit_name: u.unit.unit_code, offerings: [1, 2], requisites: [] })) as never,
    );
  });

  test('a student who follows the planner is predicted exactly', async () => {
    const result = await runBacktest([
      record('S1', [
        row('COS10009', '2025_MAR_S1'), row('COS10003', '2025_MAR_S1'),
        row('COS20007', '2025_SEP_S2'), row('TNE10006', '2025_SEP_S2'),
      ]),
    ], { target });

    expect(result.summary.accuracy).toBe(1);
    expect(result.studentRecall).toBe(1);
    expect(result.enrolmentOutcomes['named pick']).toBe(2);
  });

  // The leak the whole cut exists to prevent. The student failed COS10009 in the semester that was still
  // running at prediction time, then retook it. At the time the failure had not happened, so the estimator
  // must NOT have seen it: it should predict COS20007 as normal and miss the retake.
  test('a failure in the running semester is not visible to the prediction', async () => {
    const result = await runBacktest([
      record('S1', [
        row('COS10009', '2025_MAR_S1', 'Complete', 'N', 0),
        row('COS10003', '2025_MAR_S1'),
        row('COS10009', '2025_SEP_S2'),
        row('TNE10006', '2025_SEP_S2'),
      ]),
    ], { target });

    const byCode = new Map(result.units.map((u) => [u.code, u]));
    expect(byCode.get('COS20007')!.predicted).toBe(1);   // predicted, because the failure was unknown
    expect(byCode.get('COS20007')!.actual).toBe(0);
    expect(byCode.get('COS10009')!.predicted).toBe(0);   // the retake was not foreseen
    expect(byCode.get('COS10009')!.actual).toBe(1);
  });

  test('only students enrolled in the running semester, with a record reaching the target, are scored', async () => {
    const result = await runBacktest([
      record('ACTIVE', [row('COS10009', '2025_MAR_S1'), row('TNE10006', '2025_SEP_S2')]),
      record('LEFT_EARLIER', [row('COS10009', '2024_MAR_S1'), row('TNE10006', '2025_SEP_S2')]),
      record('STOPS', [row('COS10009', '2025_MAR_S1')]),
      record('NEW', [row('COS10009', '2025_SEP_S2')]),
    ], { target });

    expect(result.students).toMatchObject({ included: 1, notActive: 1, outcomeUnknown: 1, newIntake: 1 });
  });

  test('every real enrolment is accounted for exactly once', async () => {
    const result = await runBacktest([
      record('S1', [
        row('COS10009', '2025_MAR_S1'), row('COS10003', '2025_MAR_S1'),
        row('COS20007', '2025_SEP_S2'), row('TNE10006', '2025_SEP_S2'), row('ELSEWHERE', '2025_SEP_S2'),
      ]),
    ], { target });

    const outcomes = Object.values(result.enrolmentOutcomes).reduce((a, b) => a + b, 0);
    expect(outcomes).toBe(3);
    expect(result.enrolmentOutcomes['named pick']).toBe(2);
    expect(result.enrolmentOutcomes['not in the detected planner']).toBe(1);
  });

  test('says what the result cannot tell you', async () => {
    const result = await runBacktest([record('S1', [row('COS10009', '2025_MAR_S1'), row('TNE10006', '2025_SEP_S2')])], { target });
    expect(result.notes.some((n) => /retention/i.test(n))).toBe(true);
    expect(result.notes.some((n) => /generated/i.test(n))).toBe(false);   // imported, so no mock caveat
  });
});
