import { NextRequest, NextResponse } from 'next/server';
import { fetchDegreeAudit, getStatus, PortalAuthError } from '../../../../../core/services/portal/portalSessionService';
import { scraperStore } from '../store';

export async function POST(req: NextRequest) {
  if (getStatus().sessionStatus !== 'logged-in') {
    return NextResponse.json({ ok: false, error: 'Not logged in to portal' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { dbId, enrollID, studentNumber } = body as { dbId?: number; enrollID?: number; studentNumber?: string };
  if (!dbId || !enrollID) {
    return NextResponse.json({ ok: false, error: 'dbId and enrollID are required' }, { status: 400 });
  }

  try {
    const student = await fetchDegreeAudit(dbId, enrollID, studentNumber ?? '');

    // Store in scraperStore so legacy DOM scraper polling still works
    scraperStore.result = student;
    scraperStore.status = 'done';

    return NextResponse.json({ ok: true, student });
  } catch (err) {
    if (err instanceof PortalAuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : 'Failed to fetch degree audit';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
