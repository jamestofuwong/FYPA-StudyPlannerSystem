// ============================================================
// Tests for core/services/classEstimation/scrapeOrchestrator.ts.
// This is the per-student scrape loop moved out of web/app/api/class-estimation/run/route.ts, the fetch logic
// itself is unchanged from the original route, what's new is that every successfully audited student now gets
// mapped and pushed into the estimationStore instead of vanishing into an array nothing downstream ever read.
// portalSessionService is mocked so no real portal call happens, the real estimationStore and
// scrapedStudentMapper are used as-is, since both are already covered by their own test files.
// ============================================================

import { runScrapeForStudents } from '@core/services/classEstimation/scrapeOrchestrator';
import { getEstimationRecords, resetEstimationRecords } from '@core/services/classEstimation/estimationStore';
import * as portalSessionService from '@core/services/portal/portalSessionService';

// A plain jest.mock(path) auto-mock would still load and parse the real module to build the mock, which pulls in
// captureLoginSession.ts -> puppeteer, an ESM-only package Jest's default transform can't parse. An explicit
// factory sidesteps that entirely, since the real file is never actually loaded.
jest.mock('@core/services/portal/portalSessionService', () => ({
  fetchEnrollments: jest.fn(),
  fetchDegreeAudit: jest.fn(),
}));

const fetchEnrollments = jest.mocked(portalSessionService.fetchEnrollments);
const fetchDegreeAudit = jest.mocked(portalSessionService.fetchDegreeAudit);

function student(id: string, dbId: number) {
  return { student_id: id, name: `Student ${id}`, db_id: dbId };
}

function scrapedStudent(course = 'Computer Science') {
  return {
    course, status: 'Active', cgpa: 3.5, creditsRequired: 300, creditsCompleted: 100,
    gradeLevel: 'Year 2', enrollmentDate: '2024-02-01', graduationDate: null,
    scheduledCredits: 12.5, courseList: [],
  };
}

function callbacks() {
  return { onProgress: jest.fn(), onStudentDone: jest.fn(), onStudentSkip: jest.fn(), onStudentError: jest.fn() };
}

describe('runScrapeForStudents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetEstimationRecords();
  });

  test('stores one EstimationRecord per successfully audited student', async () => {
    fetchEnrollments.mockResolvedValue([{ EnrollId: 1, EnrollmentDesc: 'Computer Science' }]);
    fetchDegreeAudit.mockResolvedValue(scrapedStudent() as never);

    const cb = callbacks();
    const summary = await runScrapeForStudents([student('S1', 1)], cb, () => false);

    expect(summary).toEqual({ completed: 1, failed: 0, skipped: 0 });
    expect(getEstimationRecords()).toHaveLength(1);
    expect(getEstimationRecords()[0].studentId).toBe('S1');
    expect(cb.onStudentDone).toHaveBeenCalledWith('S1', 'Student S1', 'Computer Science');
  });

  // The MPU-filtering rule is unchanged from the original route, a student whose only enrollment is MPU has no
  // real degree enrollment to audit against, so it's skipped before ever calling fetchDegreeAudit.
  test('skips a student with only MPU enrollments, never calls fetchDegreeAudit', async () => {
    fetchEnrollments.mockResolvedValue([{ EnrollId: 1, EnrollmentDesc: 'Mata Pelajaran Umum' }]);

    const cb = callbacks();
    const summary = await runScrapeForStudents([student('S1', 1)], cb, () => false);

    expect(summary).toEqual({ completed: 0, failed: 0, skipped: 1 });
    expect(fetchDegreeAudit).not.toHaveBeenCalled();
    expect(getEstimationRecords()).toEqual([]);
  });

  test('counts a fetchEnrollments failure as failed, continues to the next student', async () => {
    fetchEnrollments
      .mockRejectedValueOnce(new Error('portal down'))
      .mockResolvedValueOnce([{ EnrollId: 1, EnrollmentDesc: 'CS' }]);
    fetchDegreeAudit.mockResolvedValue(scrapedStudent() as never);

    const cb = callbacks();
    const summary = await runScrapeForStudents([student('S1', 1), student('S2', 2)], cb, () => false);

    expect(summary).toEqual({ completed: 1, failed: 1, skipped: 0 });
    expect(cb.onStudentError).toHaveBeenCalledWith('S1', 'Student S1', 'portal down');
  });

  // isCancelled is checked at the top of the loop, matching the original route's cancellation behavior, a
  // cancelled run should never call fetchEnrollments at all for the remaining students.
  test('stops processing once isCancelled returns true', async () => {
    fetchEnrollments.mockResolvedValue([{ EnrollId: 1, EnrollmentDesc: 'CS' }]);

    const cb = callbacks();
    const summary = await runScrapeForStudents([student('S1', 1), student('S2', 2)], cb, () => true);

    expect(summary).toEqual({ completed: 0, failed: 0, skipped: 0 });
    expect(fetchEnrollments).not.toHaveBeenCalled();
  });

  // Every new run wipes whatever the previous run collected, matching the original route's
  // "globalThis.__estimationResults = []" reset at the start of each request.
  test('resets the store at the start of a run, dropping records from a previous run', async () => {
    fetchEnrollments.mockResolvedValue([{ EnrollId: 1, EnrollmentDesc: 'CS' }]);
    fetchDegreeAudit.mockResolvedValue(scrapedStudent() as never);
    const cb = callbacks();

    await runScrapeForStudents([student('S1', 1)], cb, () => false);
    await runScrapeForStudents([student('S2', 2)], cb, () => false);

    expect(getEstimationRecords().map((r) => r.studentId)).toEqual(['S2']);
  });
});
