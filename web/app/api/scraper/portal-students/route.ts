import { NextResponse } from 'next/server';
import { getStudents, getStatus } from '../../../../../core/services/portal/portalSessionService';

export async function GET() {
  if (getStatus().sessionStatus !== 'logged-in') {
    return NextResponse.json({ error: 'Not logged in to portal' }, { status: 401 });
  }

  const students = getStudents();
  return NextResponse.json({ students, total: students.length });
}
