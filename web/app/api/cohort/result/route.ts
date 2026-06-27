import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession, updateStudentResult } from '../store';

export const runtime = 'nodejs';

/**
 * POST /api/cohort/result — Mode B per-student result submission.
 *
 * Body: { sessionId: string, studentId: string, matchResult: any, graduationCheck: any }
 *
 * Called by the frontend after each student's scrape + match pipeline has
 * completed. Updates the student entry in the active cohort session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, studentId, matchResult, graduationCheck } = body ?? {};

    if (!sessionId || !studentId) {
      return NextResponse.json(
        { error: 'sessionId and studentId are required.' },
        { status: 400 },
      );
    }

    const session = getActiveSession();
    if (!session) {
      return NextResponse.json(
        { error: 'No active cohort session found.' },
        { status: 404 },
      );
    }

    if (session.id !== sessionId) {
      return NextResponse.json(
        { error: 'Session ID does not match active session.' },
        { status: 409 },
      );
    }

    const summarised = matchResult
      ? {
          detectedMajor: matchResult?.primaryMajor?.majorName ?? null,
          majorName: matchResult?.primaryMajor?.majorName ?? null,
          matchPct: matchResult?.primaryMajor?.matchPct ?? 0,
          atRiskLevel: matchResult?.riskReport?.level ?? 'unknown',
          graduationEligible: graduationCheck?.isEligible ?? false,
          missingCoreCount: matchResult?.unmatchedCore?.length ?? 0,
          status: matchResult?.status ?? 'noMajorDetected',
        }
      : undefined;

    updateStudentResult(studentId, {
      status: summarised ? 'done' : 'error',
      matchResult: summarised,
      error: summarised ? undefined : 'No match result provided',
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Cohort Result] Error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update student result.' },
      { status: 500 },
    );
  }
}
