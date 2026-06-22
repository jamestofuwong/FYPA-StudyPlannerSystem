// REQ-FUN-610: API route for reading and writing SystemConfig key-value pairs.
// Used by the Settings page to persist the second major detection threshold.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';

const ALLOWED_KEYS = ['second_major_threshold'] as const;
type AllowedKey = typeof ALLOWED_KEYS[number];

function isAllowedKey(k: string): k is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(k);
}

// GET /api/config?key=second_major_threshold
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key || !isAllowedKey(key)) {
    return NextResponse.json({ error: 'Invalid or missing key' }, { status: 400 });
  }
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    return NextResponse.json({ key, value: row?.value ?? null });
  } catch {
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

// POST /api/config  { key: string, value: string }
export async function POST(req: NextRequest) {
  let body: { key?: string; value?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { key, value } = body;
  if (!key || !isAllowedKey(key) || value === undefined) {
    return NextResponse.json({ error: 'Invalid or missing key/value' }, { status: 400 });
  }
  try {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return NextResponse.json({ key, value });
  } catch {
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
