import { NextResponse } from 'next/server';
import { upsertUnits, getAllUnits, saveSingleUnit, } from '../../../../core/db/repositories/unitRepository';
import { prisma } from '../../../../core/db/client';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  // 1. If search query exists, run existing fast autocomplete
  if (q) {
    const results = await prisma.unit.findMany({
      where: {
        OR: [
          { unit_code: { contains: q, mode: 'insensitive' } },
          { unit_name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { unit_code: true, unit_name: true },
      orderBy: [{ unit_code: 'asc' }],
      take: 10,
    });
    return NextResponse.json(results);
  }

  // 2. If no query, return all units with offerings for the Units Management page
  try {
    const allUnits = await getAllUnits();
    return NextResponse.json(allUnits);
  } catch (error) {
    console.error('[API] GET /api/units error:', error);
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Case A: Batch import from modal/requisite check ({ units: [...] })
    if (Array.isArray(body.units)) {
      await upsertUnits(body.units);
      return NextResponse.json({ success: true });
    }

    // Case B: Single unit add/edit from the new Units Management pop-up
    if (body.unit_code && body.unit_name) {
      const saved = await saveSingleUnit({
        unit_code: body.unit_code,
        unit_name: body.unit_name,
        offerings: body.offerings,
      });
      return NextResponse.json(saved, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Invalid payload: expected { units: [...] } or { unit_code, unit_name }' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[API] POST /api/units error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}