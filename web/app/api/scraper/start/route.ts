import { NextRequest, NextResponse } from 'next/server';
import { scraperStore } from '../store';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { studentId } = body as { studentId?: string };
  if (!studentId || typeof studentId !== 'string') {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  }

  scraperStore.status = 'pending';
  scraperStore.studentId = studentId;
  scraperStore.result = null;
  scraperStore.error = null;

  return NextResponse.json({ queued: true, studentId });
}
