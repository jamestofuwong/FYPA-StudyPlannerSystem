// ============================================================
// Tests for core/services/classEstimation/courseDetector.ts.
//
// Each Head of Department imports their own course's students, and nothing in a DPA export names the course,
// so it is read off the units. What matters most: a student who has only just enrolled has passed nothing,
// and their booked units are the only clue, so every transcript row counts; and MPU units, which every course
// shares, must not count at all.
// ============================================================

import { detectBatchCourse } from '@core/services/classEstimation/courseDetector';
import type { EstimationRecord } from '@shared/types/classEstimation';

const CS = 'Bachelor of Computer Science';
const BUS = 'Bachelor of Business';

function planner(course: string, slotted: string[], pool: string[] = []) {
  return {
    course: { name: course },
    units: slotted.map((code) => ({ unit: { unit_code: code } })),
    elective_groups: pool.length ? [{ units: pool.map((code) => ({ unit: { unit_code: code } })) }] : [],
  };
}

const planners = [
  planner(CS, ['COS10009', 'COS10003', 'COS20007', 'MPU3193'], ['COS30019']),
  planner(CS, ['COS10009', 'COS10003', 'TNE10006', 'MPU3193']),
  planner(BUS, ['BUS10001', 'ACC10002', 'MKT10003', 'MPU3193'], ['FIN20001']),
];

function student(id: string, rows: Array<[string, string]>): EstimationRecord {
  return {
    studentId: id,
    transcript: rows.map(([code, status]) => ({ courseId: code, status })),
  } as unknown as EstimationRecord;
}

describe('detectBatchCourse', () => {
  test('a batch of Business students is detected as Business', () => {
    const result = detectBatchCourse([
      student('1', [['BUS10001', 'Complete'], ['ACC10002', 'Complete']]),
      student('2', [['MKT10003', 'Complete'], ['FIN20001', 'Current']]),
    ], planners);

    expect(result.course).toBe(BUS);
    expect(result.agreeing).toBe(2);
    expect(result.elsewhere).toEqual({});
  });

  // An enrolled student who has passed nothing yet is identified by what they are booked into.
  test('booked units alone are enough to place a student', () => {
    const result = detectBatchCourse([student('1', [['BUS10001', 'Scheduled'], ['ACC10002', 'Scheduled']])], planners);
    expect(result.course).toBe(BUS);
  });

  // Every course shares MPU units, so they cannot tell courses apart. A student holding only MPU units has
  // nothing to go on and follows the batch.
  test('MPU units are ignored', () => {
    const result = detectBatchCourse([
      student('1', [['BUS10001', 'Complete']]),
      student('2', [['MPU3193', 'Complete']]),
    ], planners);

    expect(result.course).toBe(BUS);
    expect(result.agreeing).toBe(1);
    expect(result.undetermined).toBe(1);
  });

  test('elective-group units count towards their course', () => {
    expect(detectBatchCourse([student('1', [['COS30019', 'Complete']])], planners).course).toBe(CS);
  });

  test('a student with nothing in any planner follows the batch', () => {
    const result = detectBatchCourse([
      student('1', [['COS10009', 'Complete']]),
      student('2', [['XYZ99999', 'Complete']]),
      student('3', []),
    ], planners);

    expect(result.course).toBe(CS);
    expect(result.undetermined).toBe(2);
  });

  // A batch is meant to be one course. If it is not, the minority is reported rather than folded in silently.
  test('a mixed batch takes the majority and reports the rest', () => {
    const result = detectBatchCourse([
      student('1', [['BUS10001', 'Complete']]),
      student('2', [['ACC10002', 'Complete']]),
      student('3', [['COS10009', 'Complete']]),
    ], planners);

    expect(result.course).toBe(BUS);
    expect(result.elsewhere).toEqual({ [CS]: 1 });
  });

  test('a student split evenly between two courses does not vote', () => {
    const result = detectBatchCourse([student('1', [['COS10009', 'Complete'], ['BUS10001', 'Complete']])], planners);
    expect(result.undetermined).toBe(1);
  });

  test('with one course loaded, an empty batch is that course', () => {
    const result = detectBatchCourse([student('1', [])], [planner(CS, ['COS10009'])]);
    expect(result.course).toBe(CS);
  });

  test('with several courses and nothing to go on, no course is claimed', () => {
    const result = detectBatchCourse([student('1', [['MPU3193', 'Complete']])], planners);
    expect(result.course).toBeNull();
  });

  test('lists every course the planners belong to', () => {
    expect(detectBatchCourse([], planners).courses).toEqual([BUS, CS]);
  });
});
