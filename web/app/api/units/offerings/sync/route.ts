import { NextResponse } from 'next/server';
import {
  getInferredOfferingsDiff,
  overwriteUnitOfferings,
} from '../../../../../../core/db/repositories/unitRepository';

// GET Run analysis and preview diffs
export async function GET() {
  try {
    const preview = await getInferredOfferingsDiff();
    return NextResponse.json(preview);
  } catch (error: any) {
    console.error('[API] Sync preview failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to infer offerings from planners' },
      { status: 500 }
    );
  }
}

// POST Confirm and overwrite
export async function POST(req: Request) {
  try {
    const { updates } = await req.json();
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Invalid updates payload' }, { status: 400 });
    }

    await overwriteUnitOfferings(updates);
    return NextResponse.json({ success: true, count: updates.length });
  } catch (error: any) {
    console.error('[API] Overwrite offerings failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply offerings overwrite' },
      { status: 500 }
    );
  }
}
