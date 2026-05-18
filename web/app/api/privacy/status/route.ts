import { NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { NOTICE_VERSION } from '../../../../lib/privacyNoticeContent';

export const runtime = 'nodejs';

// GET /api/privacy/status
// Returns whether the current notice version has been acknowledged.
export async function GET() {
  try {
    const latest = await prisma.privacyEvent.findFirst({
      where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
      orderBy: { occurred_at: 'desc' },
    });
    return NextResponse.json({ acknowledged: !!latest, version: NOTICE_VERSION });
  } catch (e) {
    console.error('[api/privacy/status]', e);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
