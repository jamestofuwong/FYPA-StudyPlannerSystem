import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // ?all=true returns all statuses (used by cloud UI)
  // By default, only return active planners (used by local app)
  const all = req.nextUrl.searchParams.get('all') === 'true';
  try {
    const entries = await db.portalPlannerEntry.findMany({
      where: all ? undefined : { status: 'active' },
      orderBy: { first_seen_at: 'desc' },
    });
    return NextResponse.json(entries);
  } catch (e) {
    console.error('[api/planners] DB error:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
