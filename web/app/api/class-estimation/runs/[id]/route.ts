// ============================================================
// One saved estimation run: read it back, or delete it.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getEstimationRun,
  deleteEstimationRun,
} from '../../../../../../core/db/repositories/estimationRunRepository';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getEstimationRun(id);
    if (!run) return NextResponse.json({ error: 'No run with that id' }, { status: 404 });
    return NextResponse.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation runs] read failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const deleted = await deleteEstimationRun(id);
    if (!deleted) return NextResponse.json({ error: 'No run with that id' }, { status: 404 });
    return NextResponse.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation runs] delete failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
