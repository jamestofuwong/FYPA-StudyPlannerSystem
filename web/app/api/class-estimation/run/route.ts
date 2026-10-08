import { type NextRequest } from 'next/server';
import { runScrapeForStudents } from '../../../../../core/services/classEstimation/scrapeOrchestrator';
import { realPortalSource } from '../../../../../core/services/classEstimation/sources/realPortalSource';

// Force dynamic so Next.js never caches this streaming response.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // Always the live student portal. The generated-student source used during development is no longer
  // reachable from the app: a released build must never be able to estimate from students who do not exist.
  // It stays in core/services/classEstimation/sources for the test suite and the backtest script.
  const source = realPortalSource;

  const readiness = await source.readiness();
  if (!readiness.ready) {
    return new Response(
      JSON.stringify({ error: readiness.reason ?? `Source "${source.id}" is not ready`, source: source.id }),
      { status: 409 },
    );
  }

  // ── ID range filter ─────────────────────────────────────────────────────────
  const minIdParam = searchParams.get('minId');
  const maxIdParam = searchParams.get('maxId');
  const minIdNum = minIdParam ? parseInt(minIdParam, 10) : null;
  const maxIdNum = maxIdParam ? parseInt(maxIdParam, 10) : null;

  let students = await source.getStudents();

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

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // The source is named in the start event so a run's provenance is visible in the UI, and generated
      // students can never be mistaken for a real cohort.
      send({ type: 'start', total, source: source.id, sourceLabel: source.label });

      const summary = await runScrapeForStudents(
        students,
        {
          onProgress: (current, progressTotal, studentName, phase) =>
            send({ type: 'progress', current, total: progressTotal, studentName, phase }),
          onStudentDone: (studentId, studentName, course) =>
            send({ type: 'student-done', studentId, studentName, course }),
          onStudentSkip: (studentId, studentName, reason) =>
            send({ type: 'student-skip', studentId, studentName, reason }),
          onStudentError: (studentId, studentName, error) =>
            send({ type: 'student-error', studentId, studentName, error }),
        },
        () => cancelled,
        source,
      );

      send({
        type: 'complete',
        completed: summary.completed,
        failed: summary.failed,
        skipped: summary.skipped,
        total: summary.completed + summary.failed + summary.skipped,
        source: source.id,
      });
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
