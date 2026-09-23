import { NextResponse } from 'next/server';
import { logout } from '../../../../../core/services/portal/portalSessionService';

export async function POST() {
  logout();
  return NextResponse.json({ ok: true });
}
