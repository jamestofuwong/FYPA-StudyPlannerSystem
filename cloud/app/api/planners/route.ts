import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const entries = await db.portalPlannerEntry.findMany({
      orderBy: { first_seen_at: 'desc' },
    });
    return NextResponse.json(entries);
  } catch (e) {
    console.error('[api/planners] DB error:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
