import { NextRequest, NextResponse } from 'next/server';
import { searchStudents, getStatus } from '../../../../../../core/services/portal/portalSessionService';

export async function GET(req: NextRequest) {
  if (getStatus().sessionStatus !== 'logged-in') {
    return NextResponse.json({ error: 'Not logged in to portal' }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ results: [], source: 'portal' });

  const results = searchStudents(q);
  return NextResponse.json({ results, source: 'portal' });
}
