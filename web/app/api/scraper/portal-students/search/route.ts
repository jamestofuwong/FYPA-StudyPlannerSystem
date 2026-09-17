import { NextRequest, NextResponse } from 'next/server';
import { portalStore, portalSessionStore } from '../../store';

export async function GET(req: NextRequest) {
  if (portalSessionStore.sessionStatus !== 'logged-in') {
    return NextResponse.json({ error: 'Not logged in to portal' }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  if (!q) {
    return NextResponse.json({ results: [], source: 'portal' });
  }

  const results = portalStore.students
    .filter(s => {
      const fullName = `${s.FirstName} ${s.MiddleName} ${s.LastName}`.toLowerCase();
      return fullName.includes(q) || s.StudentNumber.toLowerCase().includes(q);
    })
    .slice(0, 10)
    .map(s => ({
      student_id: s.StudentNumber,
      name: [s.FirstName, s.MiddleName, s.LastName].filter(Boolean).join(' '),
      db_id: s.Id,
    }));

  return NextResponse.json({ results, source: 'portal' });
}
