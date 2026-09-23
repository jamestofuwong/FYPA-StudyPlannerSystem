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

import {
  fetchEnrollments,
  fetchDegreeAudit,
} from '../portal/portalSessionService';
import { resolveUnitStates } from '../../shared/constants/grades';
import { mapScrapedStudentToRawInput } from './scrapedStudentMapper';
import { resetEstimationRecords, pushEstimationRecord } from './estimationStore';

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

export async function runScrapeForStudents(
  students: { student_id: string; name: string; db_id: number }[],
  callbacks: ScrapeCallbacks,
  isCancelled: () => boolean,
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

    let enrollments: { EnrollId: number; EnrollmentDesc: string }[];
    try {
      enrollments = await fetchEnrollments(student.db_id);
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
      const scraped = await fetchDegreeAudit(student.db_id, primary.EnrollId, student.student_id);

      const { rawInput, warnings } = mapScrapedStudentToRawInput(scraped, student.student_id);
      const unitStates = resolveUnitStates(scraped.courseList);

      pushEstimationRecord({
        studentId: student.student_id,
        name: student.name,
        dbId: student.db_id,
        enrollId: primary.EnrollId,
        scraped,
        rawInput,
        unitStates,
        mappingWarnings: warnings,
      });

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
