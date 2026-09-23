import { NextResponse, type NextRequest } from 'next/server';
import { getEstimationRecords } from '../../../../../core/services/classEstimation/estimationStore';
import { runEstimationPreview } from '../../../../../core/services/classEstimation/estimationPreview';
import { DEFAULT_CLASS_ESTIMATION_CONFIG } from '../../../../../core/shared/types/classEstimation';

export const dynamic = 'force-dynamic';

// Runs the class-estimation phases built so far (matching, candidate resolution, eligibility, ranking) over the
// records the last scrape left in memory, and returns a per-student report. Read-only: nothing is written.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const term = parseInt(searchParams.get('term') ?? '', 10);
  if (term !== 1 && term !== 2) {
    return NextResponse.json({ error: 'term must be 1 or 2' }, { status: 400 });
  }

  const loadCapParam = searchParams.get('loadCap');
  const loadCap = loadCapParam ? parseInt(loadCapParam, 10) : DEFAULT_CLASS_ESTIMATION_CONFIG.loadCap;
  if (!Number.isInteger(loadCap) || loadCap < 1) {
    return NextResponse.json({ error: 'loadCap must be a positive integer' }, { status: 400 });
  }

  const records = getEstimationRecords();
  if (records.length === 0) {
    return NextResponse.json(
      { error: 'No scraped students in memory. Run the scrape first (records are cleared when the app restarts).' },
      { status: 400 },
    );
  }

  try {
    const preview = await runEstimationPreview(records, { targetTerm: term, loadCap });
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation preview]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
