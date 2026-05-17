import { NextResponse } from 'next/server';
import { upsertUnits } from '../../../../core/db/repositories/unitRepository';

export async function POST(req: Request) {
  const { units } = await req.json();
  await upsertUnits(units);
  return NextResponse.json({ success: true });
}