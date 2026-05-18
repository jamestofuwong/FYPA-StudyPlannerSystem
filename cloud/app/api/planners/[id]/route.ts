import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
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

// PATCH /api/planners/[id]  — status transitions
// Allowed: draft → active, active → archived, archived → active
// Not allowed: anything → draft
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json() as { status?: string };
    const newStatus = body.status;

    if (!newStatus || !['active', 'archived'].includes(newStatus)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "active" or "archived".' },
        { status: 400 },
      );
    }

    const entry = await db.portalPlannerEntry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // draft → active requires planner to have been parsed
    if (entry.status === 'draft' && newStatus === 'active' && !entry.planner_template_id) {
      return NextResponse.json(
        { error: 'Cannot approve a planner that has not been parsed yet.' },
        { status: 422 },
      );
    }

    const updated = await db.portalPlannerEntry.update({
      where: { id },
      data: { status: newStatus },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('[api/planners/[id] PATCH] DB error:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
