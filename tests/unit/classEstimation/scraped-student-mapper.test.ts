// ============================================================
// Tests for core/services/classEstimation/scrapedStudentMapper.ts.
// ScrapedStudent has no intakeYear, intakeSemester, courseType, or hasWIL field, so every one of those is either
// derived from a weaker signal (enrollmentDate) or defaulted from config. These tests check both the derivation
// logic itself and that every default gets recorded in the warnings array, since that's the whole point of
// keeping it, so a run can be audited afterward instead of trusting silent guesses.
// ============================================================

import { mapScrapedStudentToRawInput, deriveSemesterFromMonth } from '@core/services/classEstimation/scrapedStudentMapper';
import type { ScrapedStudent } from '@shared/types/student';

function scrapedStudent(overrides: Partial<ScrapedStudent> = {}): ScrapedStudent {
  return {
    course: 'Bachelor of Computer Science', status: 'Active', cgpa: 3.5,
    creditsRequired: 300, creditsCompleted: 100, gradeLevel: 'Year 2',
    enrollmentDate: '2024-02-15', graduationDate: null, scheduledCredits: 12.5,
    courseList: [], ...overrides,
  };
}

// deriveSemesterFromMonth partitions the full 12-month calendar, Jan-Jun maps to semester 1, Jul-Dec to semester 2.
describe('deriveSemesterFromMonth', () => {
  test.each([[1, 1], [6, 1], [7, 2], [12, 2]])('month %i maps to semester %i', (month, expected) => {
    expect(deriveSemesterFromMonth(month)).toBe(expected);
  });
});

describe('mapScrapedStudentToRawInput', () => {
  test('derives intakeYear/intakeSemester from a valid enrollmentDate, no warning for that field', () => {
    const { rawInput, warnings } = mapScrapedStudentToRawInput(scrapedStudent({ enrollmentDate: '2023-08-01' }), 'S1');
    expect(rawInput.intakeYear).toBe(2023);
    expect(rawInput.intakeSemester).toBe(2);
    expect(warnings.some((w) => w.includes('enrollmentDate'))).toBe(false);
  });

  // A malformed or missing enrollmentDate shouldn't crash the mapper, it should fall back to something safe and say so.
  test('falls back to the current year/semester 1 and warns when enrollmentDate is unparseable', () => {
    const { rawInput, warnings } = mapScrapedStudentToRawInput(scrapedStudent({ enrollmentDate: 'not-a-date' }), 'S1');
    expect(rawInput.intakeYear).toBe(new Date().getUTCFullYear());
    expect(rawInput.intakeSemester).toBe(1);
    expect(warnings.some((w) => w.includes('enrollmentDate'))).toBe(true);
  });

  // courseType is always defaulted right now, since there's no portal field that maps to it, but it's still recorded
  // as a warning for traceability even though plannerFilter.ts confirms it's inert to which planner gets matched.
  test('always defaults courseType to "degree" and warns about it', () => {
    const { rawInput, warnings } = mapScrapedStudentToRawInput(scrapedStudent(), 'S1');
    expect(rawInput.courseType).toBe('degree');
    expect(warnings.some((w) => w.includes('courseType'))).toBe(true);
  });

  test('defaults hasWIL from config and warns about it', () => {
    const { rawInput, warnings } = mapScrapedStudentToRawInput(scrapedStudent(), 'S1', {
      loadCap: 4, retentionRate: 0.85, defaultHasWIL: false,
    });
    expect(rawInput.hasWIL).toBe(false);
    expect(warnings.some((w) => w.includes('hasWIL'))).toBe(true);
  });

  // completedUnitCodes should be a pure passthrough of getCompletedUnitCodes, passed grades and in-progress units
  // count, failed units (grade N here) do not, so they stay available as "not yet taken" for the matching pipeline.
  test('completedUnitCodes matches passed + in-progress units on the transcript', () => {
    const { rawInput } = mapScrapedStudentToRawInput(scrapedStudent({
      courseList: [
        { courseId: 'COS10009', courseTitle: 'X', level: '1', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'HD', term: '20241' },
        { courseId: 'COS10001', courseTitle: 'Y', level: '1', credits: 12.5, creditsEarned: 0, status: 'Current', grade: '', term: '20242' },
        { courseId: 'COS10002', courseTitle: 'Z', level: '1', credits: 12.5, creditsEarned: 0, status: 'Complete', grade: 'N', term: '20241' },
      ],
    }), 'S1');

    expect(rawInput.completedUnitCodes.sort()).toEqual(['COS10001', 'COS10009']);
  });

  test('studentID on rawInput is the passed-in studentId, not anything from the scraped payload', () => {
    const { rawInput } = mapScrapedStudentToRawInput(scrapedStudent(), 'S-123');
    expect(rawInput.studentID).toBe('S-123');
  });
});
