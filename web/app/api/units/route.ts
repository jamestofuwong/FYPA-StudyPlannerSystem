import { NextResponse } from 'next/server';
import { upsertUnits } from '../../../../core/db/repositories/unitRepository';
import { prisma } from '../../../../core/db/client';

export async function POST(req: Request) {
  const { units } = await req.json();
  await upsertUnits(units);
  return NextResponse.json({ success: true });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json([]);

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