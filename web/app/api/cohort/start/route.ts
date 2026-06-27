import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { NOTICE_VERSION } from '../../../../lib/privacyNoticeContent';
import { createSession } from '../store';

export const runtime = 'nodejs';

/**
 * POST /api/cohort/start — Mode B (sequential portal scraping) entry point.
 *
 * Body: { studentIds: string[] }
 * Creates a cohort session with all student IDs initialised as 'pending'.
 * Returns { sessionId, totalCount }.
 *
 * Processing is NOT done here — the frontend drives each individual student
 * scrape via the existing scraping page, then submits results to
 * POST /api/cohort/result.
 */
export async function POST(req: NextRequest) {
  // Privacy gate (REQ-PRI-101)
  const acknowledged = await prisma.privacyEvent.findFirst({
    where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
  });
  if (!acknowledged) {
    return NextResponse.json(
      { error: 'Privacy notice has not been acknowledged. Please restart the application and accept the privacy notice before processing cohort data.' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const studentIds: string[] = body?.studentIds ?? [];

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'studentIds must be a non-empty array.' },
        { status: 400 },
      );
    }

    const validIds = studentIds
      .map((id) => String(id).trim())
      .filter((id) => id.length > 0);

    if (validIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid student IDs provided.' },
        { status: 400 },
      );
    }

    const session = createSession('sequential', validIds.length);

    // Initialise all students as pending
    for (const studentId of validIds) {
      session.results.push({ studentId, status: 'pending' });
    }

    return NextResponse.json({
      sessionId: session.id,
      totalCount: session.totalCount,
    });
  } catch (error: any) {
    console.error('[Cohort Start] Error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to start cohort session.' },
      { status: 500 },
    );
  }
}
