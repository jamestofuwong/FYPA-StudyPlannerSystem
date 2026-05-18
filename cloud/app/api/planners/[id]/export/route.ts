import { NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { exportPlannerAsImport } from '@core/db/repositories/plannerRepository';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const entry = await db.portalPlannerEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (entry.status !== 'active') {
      return NextResponse.json(
        { error: 'This planner is not active and cannot be exported.' },
        { status: 403 },
      );
    }

    if (!entry.planner_template_id) {
      return NextResponse.json(
        { error: 'This planner has not been parsed yet and cannot be exported.' },
        { status: 422 },
      );
    }

    const planner = await exportPlannerAsImport(entry.planner_template_id);
    if (!planner) return NextResponse.json({ error: 'Planner template not found' }, { status: 404 });

    // Embed the portal unit code so the local app can store it as Course.code
    const withCode = {
      ...planner,
      course_information: { ...planner.course_information, course_code: entry.unit_code },
    };

    return NextResponse.json(withCode);
  } catch (e) {
    console.error('[api/planners/[id]/export] error:', e);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
