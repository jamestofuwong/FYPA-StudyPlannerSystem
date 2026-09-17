import { NextRequest, NextResponse } from 'next/server';
import {
  step2_navigateDegree1,
  step3_loadExtension,
  step4_collect,
  resetManualSession,
  STEP_LABELS,
  type ManualStep,
} from '../../../../../core/services/portal/manualLoginSession';
import { portalFetch, type PortalCredentials } from '../../../../../core/services/portal/portalFetch';
import { portalSessionStore, portalStore, saveSession, type PortalStudent } from '../store';

type StudentListResponse = {
  DataList: [{ value: PortalStudent[] }];
};

async function fetchAndStoreStudents(creds: PortalCredentials): Promise<void> {
  const query = encodeURIComponent(
    'Students?$select=Id,FirstName,MiddleName,LastName,StudentNumber&$filter=IsActive+eq+true',
  );
  const data = await portalFetch<StudentListResponse>(
    `/WebServices/api/HelperService/GetODataWrapper?query=${query}`,
    creds,
  );
  portalStore.students = data.DataList?.[0]?.value ?? [];
}

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

  const log = (msg: string) => console.log(`[ManualLogin step ${step}]`, msg);

  try {
    if (step === 2) {
      await step2_navigateDegree1(log);
      portalSessionStore.manualStep = 2;
      portalSessionStore.manualStepError = null;
    }

    else if (step === 3) {
      await step3_loadExtension(log);
      portalSessionStore.manualStep = 3;
      portalSessionStore.manualStepError = null;
    }

    else if (step === 4) {
      const { cookieHeader, portalToken } = await step4_collect(keepOpen, log);

      portalSessionStore.cookies = cookieHeader;
      portalSessionStore.portalToken = portalToken;
      portalSessionStore.sessionStatus = 'logged-in';
      portalSessionStore.sessionError = null;
      portalSessionStore.manualStep = 4;
      portalSessionStore.manualStepError = null;
      portalSessionStore.manualMode = false; // exit manual mode now that we're done

      saveSession();

      // Pre-fetch full student list
      fetchAndStoreStudents({ cookies: cookieHeader, portalToken })
        .then(() => console.log(`[Portal] Student list loaded: ${portalStore.students.length}`))
        .catch((err) => console.error('[Portal] Student list fetch failed:', err));
    }

    return NextResponse.json({
      ok: true,
      step,
      label: STEP_LABELS[step as ManualStep],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Step ${step} failed`;
    console.error(`[ManualLogin step ${step}] Error:`, err);

    portalSessionStore.manualStepError = message;

    if (step <= 2) {
      portalSessionStore.sessionStatus = 'login-error';
      portalSessionStore.sessionError = message;
      await resetManualSession().catch(() => {});
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
