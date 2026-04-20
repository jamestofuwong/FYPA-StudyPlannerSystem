import { NextRequest, NextResponse } from 'next/server';
import { scraperStore, type ScraperQueueStatus } from '../store';

// Dashboard polls this to know when scraping is done.
export async function GET() {
  return NextResponse.json({
    status: scraperStore.status,
    studentId: scraperStore.studentId,
    result: scraperStore.result,
    error: scraperStore.error,
  });
}

// ScraperContext calls this to claim a pending request (marks it as scraping
// and clears the queued studentId so it isn't picked up twice).
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { status, error } = body as { status?: ScraperQueueStatus; error?: string };

  if (status) scraperStore.status = status;
  if (status === 'scraping') scraperStore.studentId = null; // claimed — clear pending slot
  if (error) scraperStore.error = error;

  return NextResponse.json({ ok: true });
}
