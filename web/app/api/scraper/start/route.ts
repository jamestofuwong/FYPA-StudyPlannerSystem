import { NextRequest, NextResponse } from 'next/server';
import { scraperStore } from '../store';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { studentId, enrollmentMode, enrollmentText } = body as { studentId?: string; enrollmentMode?: string; enrollmentText?: string };
  if (!studentId || typeof studentId !== 'string') {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  }

  scraperStore.status = 'pending';
  scraperStore.studentId = studentId;
  if (enrollmentMode === 'by-text' && enrollmentText) {
    scraperStore.enrollmentMode = 'by-text';
    scraperStore.enrollmentText = enrollmentText;
  } else {
    scraperStore.enrollmentMode =
      enrollmentMode === 'earliest' || enrollmentMode === 'mpu' ? enrollmentMode : 'latest';
    scraperStore.enrollmentText = null;
  }
  scraperStore.result = null;
  scraperStore.error = null;

  // REQ-SEC-104: do not echo the student ID back in the response body
  return NextResponse.json({ queued: true });
}
