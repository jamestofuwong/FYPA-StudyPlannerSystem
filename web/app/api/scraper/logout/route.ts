import { NextResponse } from 'next/server';
import { clearPersistedSession } from '../store';

export async function POST() {
  clearPersistedSession();
  return NextResponse.json({ ok: true });
}
