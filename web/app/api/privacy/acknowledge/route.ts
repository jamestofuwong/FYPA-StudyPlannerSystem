import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { NOTICE_VERSION } from '../../../../lib/privacyNoticeContent';

export const runtime = 'nodejs';

// POST /api/privacy/acknowledge
// Body: { presented_at: ISO string } — the timestamp when the modal was shown to the user.
// Writes two PrivacyEvent rows (presented + acknowledged) and one AuditLog row.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { presented_at?: string };
    const presentedAt = body.presented_at ? new Date(body.presented_at) : new Date();

    await prisma.$transaction(async (tx) => {
      // Record when the notice was presented (REQ-PRI-104)
      await tx.privacyEvent.create({
        data: {
          event_type: 'presented',
          notice_version: NOTICE_VERSION,
          occurred_at: presentedAt,
        },
      });
      // Record the explicit acknowledgement (REQ-PRI-105)
      await tx.privacyEvent.create({
        data: {
          event_type: 'acknowledged',
          notice_version: NOTICE_VERSION,
        },
      });
      // Write audit trail entry
      await tx.auditLog.create({
        data: {
          action: 'PRIVACY_NOTICE_ACKNOWLEDGED',
          entity_type: 'privacy_events',
          new_value: { notice_version: NOTICE_VERSION, presented_at: presentedAt.toISOString() },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/privacy/acknowledge]', e);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
