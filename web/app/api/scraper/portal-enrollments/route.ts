import { NextRequest, NextResponse } from 'next/server';
import { fetchEnrollments, getStatus, PortalAuthError } from '../../../../../core/services/portal/portalSessionService';

export async function POST(req: NextRequest) {
  if (getStatus().sessionStatus !== 'logged-in') {
    return NextResponse.json({ error: 'Not logged in to portal' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { dbId } = body as { dbId?: number };
  if (!dbId || typeof dbId !== 'number') {
    return NextResponse.json({ error: 'dbId is required' }, { status: 400 });
  }

  try {
    const enrollments = await fetchEnrollments(dbId);
    if (enrollments.length === 0) {
      return NextResponse.json({ enrollments: [], error: 'No enrollments found for this student' });
    }
    return NextResponse.json({ enrollments });
  } catch (err) {
    if (err instanceof PortalAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : 'Failed to fetch enrollments';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
