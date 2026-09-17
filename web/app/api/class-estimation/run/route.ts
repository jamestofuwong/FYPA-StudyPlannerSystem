import { type NextRequest } from 'next/server';
import {
  getStudents,
  getStatus,
  fetchEnrollments,
  fetchDegreeAudit,
} from '../../../../../core/services/portal/portalSessionService';

// Force dynamic so Next.js never caches this streaming response.
export const dynamic = 'force-dynamic';

type EstimationResult = {
  student_id: string;
  name: string;
  db_id: number;
  enrollId: number;
  course: string;
  courseList: unknown[];
};

// Store results on globalThis so subsequent steps (matching, unit counting) can use them.
declare global {
  // eslint-disable-next-line no-var
  var __estimationResults: EstimationResult[] | undefined;
}

export async function GET(req: NextRequest) {
  if (getStatus().sessionStatus !== 'logged-in') {
    return new Response(JSON.stringify({ error: 'Not logged in to portal' }), { status: 401 });
  }

  // ── ID range filter ─────────────────────────────────────────────────────────
  const { searchParams } = req.nextUrl;
  const minIdParam = searchParams.get('minId');
  const maxIdParam = searchParams.get('maxId');
  const minIdNum = minIdParam ? parseInt(minIdParam, 10) : null;
  const maxIdNum = maxIdParam ? parseInt(maxIdParam, 10) : null;

  let students = getStudents();

  if (minIdNum !== null || maxIdNum !== null) {
    students = students.filter((s) => {
      const id = parseInt(s.student_id, 10);
      if (isNaN(id)) return false;
      if (minIdNum !== null && id < minIdNum) return false;
      if (maxIdNum !== null && id > maxIdNum) return false;
      return true;
    });
  }

  const total = students.length;

  if (total === 0) {
    return new Response(
      JSON.stringify({ error: 'No students match the given range — adjust the filter or log in again' }),
      { status: 400 },
    );
  }

  // Reset previous results
  globalThis.__estimationResults = [];

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: 'start', total });

      let completed = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < students.length; i++) {
        // Check cancellation at the top of each iteration
        if (cancelled) break;

        const student = students[i];
        const current = i + 1;

        // ── Phase 1: fetch enrollment list ──────────────────────────────────
        send({ type: 'progress', current, total, studentName: student.name, phase: 'enrollments' });

        let enrollments: { EnrollId: number; EnrollmentDesc: string }[];
        try {
          enrollments = await fetchEnrollments(student.db_id);
        } catch (err) {
          failed++;
          send({
            type: 'student-error',
            studentId: student.student_id,
            studentName: student.name,
            error: err instanceof Error ? err.message : 'Failed to fetch enrollments',
          });
          continue;
        }

        if (cancelled) break;

        // Select the latest non-MPU enrollment by highest EnrollId
        const nonMpu = enrollments.filter(
          (e) => !e.EnrollmentDesc.toLowerCase().includes('mata pelajaran umum'),
        );
        const primary = nonMpu.length > 0
          ? nonMpu.reduce((a, b) => (a.EnrollId > b.EnrollId ? a : b))
          : null;

        if (!primary) {
          skipped++;
          send({
            type: 'student-skip',
            studentId: student.student_id,
            studentName: student.name,
            reason: 'No valid (non-MPU) enrollment found',
          });
          continue;
        }

        // ── Phase 2: fetch degree audit ──────────────────────────────────────
        send({ type: 'progress', current, total, studentName: student.name, phase: 'audit' });

        try {
          const audit = await fetchDegreeAudit(student.db_id, primary.EnrollId, student.student_id);

          const result: EstimationResult = {
            student_id: student.student_id,
            name:       student.name,
            db_id:      student.db_id,
            enrollId:   primary.EnrollId,
            course:     audit.course,
            courseList: audit.courseList,
          };

          globalThis.__estimationResults!.push(result);
          completed++;

          send({
            type: 'student-done',
            studentId:   student.student_id,
            studentName: student.name,
            course:      audit.course,
          });
        } catch (err) {
          failed++;
          send({
            type: 'student-error',
            studentId:   student.student_id,
            studentName: student.name,
            error: err instanceof Error ? err.message : 'Failed to fetch degree audit',
          });
        }
      }

      send({ type: 'complete', completed, failed, skipped, total: completed + failed + skipped });
      controller.close();
    },

    // Called when the client closes the EventSource connection (cancel or navigate away)
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
