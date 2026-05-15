import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const runs = await db.syncRun.findMany({
      orderBy: { triggered_at: 'desc' },
      take: 100,
    });
    return NextResponse.json(runs);
  } catch (e) {
    console.error('[api/history] DB error:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
