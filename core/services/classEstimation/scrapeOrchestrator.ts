// ============================================================
// Per-student scrape loop for a class-estimation run. Extracted out of
// web/app/api/class-estimation/run/route.ts so the route stays thin
// (request parsing and SSE plumbing only) and this logic lives in
// core/services alongside the rest of the domain code, matching how
// portalSessionService.ts already separates state/logic from its routes.
//
// The loop itself (fetch enrollments, pick the primary non-MPU
// enrollment, fetch the degree audit) is unchanged from the original
// route. What's new: every successfully audited student is now mapped
// into a full EstimationRecord (via scrapedStudentMapper) and pushed
// into the ephemeral estimationStore, instead of the old flat
// EstimationResult that nothing downstream ever read.
// ============================================================

import { buildEstimationRecord } from './estimationRecordBuilder';
import { resetEstimationRecords, pushEstimationRecord } from './estimationStore';
import { realPortalSource } from './sources/realPortalSource';
import type { PortalEnrollment, PortalSource, PortalStudentSummary } from './sources/portalSource';

export type ScrapePhase = 'enrollments' | 'audit';

export interface ScrapeCallbacks {
  onProgress(current: number, total: number, studentName: string, phase: ScrapePhase): void;
  onStudentDone(studentId: string, studentName: string, course: string): void;
  onStudentSkip(studentId: string, studentName: string, reason: string): void;
  onStudentError(studentId: string, studentName: string, error: string): void;
}

export interface ScrapeSummary {
  completed: number;
  failed: number;
  skipped: number;
}

/**
 * Walks a student list, fetching each transcript and storing it as a record.
 *
 * The source is injected rather than imported, so the same loop runs against the live portal or against
 * generated data. Defaults to the live portal, so an existing caller behaves as it did before.
 */
export async function runScrapeForStudents(
  students: PortalStudentSummary[],
  callbacks: ScrapeCallbacks,
  isCancelled: () => boolean,
  source: PortalSource = realPortalSource,
): Promise<ScrapeSummary> {
  resetEstimationRecords();

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < students.length; i++) {
    if (isCancelled()) break;

    const student = students[i];
    const current = i + 1;

    callbacks.onProgress(current, students.length, student.name, 'enrollments');

    let enrollments: PortalEnrollment[];
    try {
      enrollments = await source.fetchEnrollments(student.db_id);
    } catch (err) {
      failed++;
      callbacks.onStudentError(
        student.student_id,
        student.name,
        err instanceof Error ? err.message : 'Failed to fetch enrollments',
      );
      continue;
    }

    if (isCancelled()) break;

    // Select the latest non-MPU enrollment by highest EnrollId.
    const nonMpu = enrollments.filter(
      (e) => !e.EnrollmentDesc.toLowerCase().includes('mata pelajaran umum'),
    );
    const primary = nonMpu.length > 0
      ? nonMpu.reduce((a, b) => (a.EnrollId > b.EnrollId ? a : b))
      : null;

    if (!primary) {
      skipped++;
      callbacks.onStudentSkip(student.student_id, student.name, 'No valid (non-MPU) enrollment found');
      continue;
    }

    callbacks.onProgress(current, students.length, student.name, 'audit');

    try {
      const scraped = await source.fetchDegreeAudit(student.db_id, primary.EnrollId, student.student_id);

      pushEstimationRecord(buildEstimationRecord({
        source: source.id === 'mock' ? 'mock' : 'portal',
        studentId: student.student_id,
        name: student.name,
        dbId: student.db_id,
        enrollId: primary.EnrollId,
        scraped,
        transcript: scraped.courseList,
      }));

      completed++;
      callbacks.onStudentDone(student.student_id, student.name, scraped.course);
    } catch (err) {
      failed++;
      callbacks.onStudentError(
        student.student_id,
        student.name,
        err instanceof Error ? err.message : 'Failed to fetch degree audit',
      );
    }
  }

  return { completed, failed, skipped };
}
