import { NextResponse, type NextRequest } from 'next/server';
import { getEstimationRecords } from '../../../../../core/services/classEstimation/estimationStore';
import { runEstimationPreview } from '../../../../../core/services/classEstimation/estimationPreview';
import { DEFAULT_CLASS_ESTIMATION_CONFIG } from '../../../../../core/shared/types/classEstimation';
import { describeAcademicNow } from '../../../../../core/services/classEstimation/academicCalendar';
import { resolveRetentionRate } from '../../../../../core/services/classEstimation/retention';

export const dynamic = 'force-dynamic';

// Runs the class-estimation phases built so far (matching, candidate resolution, eligibility, ranking) over the
// records the last scrape left in memory, and returns a per-student report. Read-only: nothing is written.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // The target semester is derived from the date, not chosen: an estimate is always for the next teaching
  // semester. ?term= still overrides, which is for checking the other semester by hand, not for normal use.
  const academicNow = describeAcademicNow();
  const termParam = searchParams.get('term');
  const term = termParam ? parseInt(termParam, 10) : academicNow.next.semester;
  if (term !== 1 && term !== 2) {
    return NextResponse.json({ error: 'term must be 1 or 2' }, { status: 400 });
  }

  const loadCapParam = searchParams.get('loadCap');
  const loadCap = loadCapParam ? parseInt(loadCapParam, 10) : DEFAULT_CLASS_ESTIMATION_CONFIG.loadCap;
  if (!Number.isInteger(loadCap) || loadCap < 1) {
    return NextResponse.json({ error: 'loadCap must be a positive integer' }, { status: 400 });
  }

  // Share of students expected back next semester. Rejected rather than silently corrected when out of
  // range: a rate of 0 would flatten every projection to nothing and read like a broken pipeline.
  const retentionParam = searchParams.get('retentionRate');
  const retentionRate = retentionParam
    ? resolveRetentionRate(Number(retentionParam), NaN)
    : DEFAULT_CLASS_ESTIMATION_CONFIG.retentionRate;
  if (!Number.isFinite(retentionRate)) {
    return NextResponse.json({ error: 'retentionRate must be a number from 0 to 1' }, { status: 400 });
  }

  const records = getEstimationRecords();
  if (records.length === 0) {
    return NextResponse.json(
      { error: 'No scraped students in memory. Run the scrape first (records are cleared when the app restarts).' },
      { status: 400 },
    );
  }

  try {
    const preview = await runEstimationPreview(records, { targetTerm: term, loadCap, retentionRate });
    // The derived target travels with the result so the page can state which semester it is looking at, and
    // say so when ?term= was used to override the derivation.
    return NextResponse.json({
      ...preview,
      target: {
        year: termParam ? null : academicNow.next.year,
        semester: term,
        label: termParam ? `Semester ${term}` : academicNow.label,
        reason: termParam ? 'Overridden by the term query parameter' : academicNow.reason,
        overridden: Boolean(termParam),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation preview]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
