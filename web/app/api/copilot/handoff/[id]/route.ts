import { NextResponse } from 'next/server';
import { getDashboardHandoff } from '../../../../../../core/services/copilot/handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the dashboard data a copilot answer prepared for its button.
// 404: unknown or expired id (the page then falls back to a normal search).
// 502: preparing the student failed.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const handoff = await getDashboardHandoff(id);
    if (!handoff) return NextResponse.json({ error: 'This link has expired.' }, { status: 404 });
    return NextResponse.json(handoff, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.warn('[API] GET /api/copilot/handoff failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not prepare the student.' },
      { status: 502 },
    );
  }
}
