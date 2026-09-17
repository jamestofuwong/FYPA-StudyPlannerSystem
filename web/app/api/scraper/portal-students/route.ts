import { NextResponse } from 'next/server';
import { portalStore, portalSessionStore } from '../store';

export async function GET() {
  if (portalSessionStore.sessionStatus !== 'logged-in') {
    return NextResponse.json({ error: 'Not logged in to portal' }, { status: 401 });
  }

  const students = portalStore.students.map(s => ({
    student_id: s.StudentNumber ?? '',
    name: [s.FirstName, s.MiddleName, s.LastName].filter(Boolean).join(' '),
    db_id: s.Id,
  }));

  return NextResponse.json({ students, total: students.length });
}
