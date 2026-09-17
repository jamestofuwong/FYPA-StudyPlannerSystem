import { NextRequest, NextResponse } from 'next/server';
import { loginAuto, loginManualStep1 } from '../../../../../core/services/portal/portalSessionService';

export async function POST(req: NextRequest) {
  let keepOpen = false;
  let manual = false;
  try {
    const body = await req.json();
    keepOpen = body?.keepOpen === true;
    manual   = body?.manual   === true;
  } catch { /* body is optional */ }

  if (manual) {
    loginManualStep1();
    return NextResponse.json({ started: true, manual: true });
  }

  loginAuto({ keepOpen });
  return NextResponse.json({ started: true });
}
