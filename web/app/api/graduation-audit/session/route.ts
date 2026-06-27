import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { NOTICE_VERSION } from '../../../../lib/privacyNoticeContent';
import { createAuditSession, getAuditSession } from '../store';

export async function POST(req: NextRequest) {
  const acknowledged = await prisma.privacyEvent.findFirst({
    where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
  });
  if (!acknowledged) {
    return NextResponse.json(
      { error: 'Privacy notice has not been acknowledged.' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { student, matchResult, generatedBy } = body;
    if (!student) {
      return NextResponse.json({ error: 'Missing student data' }, { status: 400 });
    }
    const session = createAuditSession({ student, matchResult, generatedBy });
    return NextResponse.json({ sessionId: session.sessionId, auditRef: session.auditRef });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  const session = getAuditSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json(session);
}
