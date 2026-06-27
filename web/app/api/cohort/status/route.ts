import { NextResponse } from 'next/server';
import { getActiveSession } from '../store';

export const runtime = 'nodejs';

/**
 * GET /api/cohort/status — returns the active cohort session or { session: null }.
 *
 * Frontend polls this during Mode A processing and Mode B sequential scraping
 * to get live progress updates.
 */
export async function GET() {
  const session = getActiveSession();
  return NextResponse.json({ session: session ?? null });
}
