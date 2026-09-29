import { NextRequest, NextResponse } from 'next/server';
import { loginAdvanceStep, PortalAuthError } from '../../../../../core/services/portal/portalSessionService';

// POST { step: 2|3|4, keepOpen?: boolean }
// Advances the manual login pipeline to the requested step.
export async function POST(req: NextRequest) {
  let body: { step?: number; keepOpen?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { step, keepOpen = false } = body;
  if (!step || step < 2 || step > 4) {
    return NextResponse.json({ ok: false, error: 'step must be 2–4' }, { status: 400 });
  }

  try {
    const { label } = await loginAdvanceStep(step as 2 | 3 | 4, keepOpen);
    return NextResponse.json({ ok: true, step, label });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Step ${step} failed`;
    const status = err instanceof PortalAuthError ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
