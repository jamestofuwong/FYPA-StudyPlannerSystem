import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const entry = await db.portalPlannerEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // If this entry has been parsed, also load the structured planner data
    let template = null;
    if (entry.planner_template_id) {
      const { prisma } = await import('@core/db/client');
      template = await prisma.plannerTemplate.findUnique({
        where: { id: entry.planner_template_id },
        include: {
          course: true,
          major: true,
          units: {
            include: { unit: true },
            orderBy: [{ year_level: 'asc' }, { semester: 'asc' }],
          },
          elective_groups: {
            include: {
              units: { include: { unit: true } },
            },
          },
        },
      });
    }

    return NextResponse.json({ entry, template });
  } catch (e) {
    console.error('[api/planners/[id]] DB error:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
