import { NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';
import { savePlannerFromImport } from '../../../../core/db/repositories/plannerRepository';

const CLOUD_URL = process.env.CLOUD_API_URL?.replace(/\/$/, '');

// Converts "March intake", "July intake", etc. to a month number.
function parseCloudIntakeMonth(str: string): number | null {
  const lower = (str ?? '').toLowerCase();
  const map: Record<string, number> = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, sept: 9,
    october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  };
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET — list all planners available on the cloud, enriched with local status
// ---------------------------------------------------------------------------
export async function GET() {
  if (!CLOUD_URL) {
    return NextResponse.json({ error: 'CLOUD_API_URL is not configured.' }, { status: 503 });
  }

  let cloudEntries: any[];
  try {
    const res = await fetch(`${CLOUD_URL}/api/planners`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Cloud responded ${res.status}`);
    cloudEntries = await res.json();
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not reach cloud app: ${e.message}` },
      { status: 502 },
    );
  }

  // Load all local planner templates to determine what's already imported
  const localTemplates = await prisma.plannerTemplate.findMany({
    include: { course: true },
  });

  const enriched = cloudEntries.map((entry: any) => {
    const intakeYear = parseInt(entry.year, 10);
    const intakeMonth = parseCloudIntakeMonth(entry.intake_month);
    const alreadyImported = localTemplates.some(
      (t) =>
        t.course.code === entry.unit_code &&
        t.intake_year === intakeYear &&
        t.intake_month === intakeMonth,
    );
    return {
      ...entry,
      is_parsed: !!entry.planner_template_id,
      local_status: alreadyImported ? 'already_imported' : 'available',
    };
  });

  return NextResponse.json(enriched);
}

// ---------------------------------------------------------------------------
// POST — pull selected planners from cloud into local database
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  if (!CLOUD_URL) {
    return NextResponse.json({ error: 'CLOUD_API_URL is not configured.' }, { status: 503 });
  }

  const { ids }: { ids: string[] } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No planner IDs provided.' }, { status: 400 });
  }

  const results: { id: string; status: 'pulled' | 'duplicate' | 'failed'; error?: string }[] = [];

  for (const id of ids) {
    try {
      const res = await fetch(`${CLOUD_URL}/api/planners/${id}/export`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export responded ${res.status}`);
      }
      const planner = await res.json();
      await savePlannerFromImport(planner);
      results.push({ id, status: 'pulled' });
    } catch (e: any) {
      if (e.message === 'DUPLICATE_PLANNER') {
        results.push({ id, status: 'duplicate' });
      } else {
        results.push({ id, status: 'failed', error: e.message });
      }
    }
  }

  return NextResponse.json({ results });
}
