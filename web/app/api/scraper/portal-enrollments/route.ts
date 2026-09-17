import { NextRequest, NextResponse } from 'next/server';
import { portalFetch, PortalAuthError } from '../../../../../core/services/portal/portalFetch';
import { portalSessionStore, clearPersistedSession } from '../store';

type EnrollmentResponse = {
  DataList: { EnrollId: number; EnrollmentDesc: string }[];
};

export async function POST(req: NextRequest) {
  if (portalSessionStore.sessionStatus !== 'logged-in' || !portalSessionStore.cookies || !portalSessionStore.portalToken) {
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
    const data = await portalFetch<EnrollmentResponse>(
      `/WebServices/api/CourseRegistration/GetEnrollmentDetailsByStudentId?StudentId=${dbId}`,
      { cookies: portalSessionStore.cookies, portalToken: portalSessionStore.portalToken },
    );

    const enrollments = data.DataList ?? [];
    if (enrollments.length === 0) {
      return NextResponse.json({ enrollments: [], error: 'No enrollments found for this student' });
    }

    return NextResponse.json({ enrollments });
  } catch (err) {
    if (err instanceof PortalAuthError) {
      clearPersistedSession();
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : 'Failed to fetch enrollments';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
