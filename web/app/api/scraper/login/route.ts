import { NextRequest, NextResponse } from 'next/server';
import { captureLoginSession } from '../../../../../core/services/portal/captureLoginSession';
import { step1_launch } from '../../../../../core/services/portal/manualLoginSession';
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

export async function POST(req: NextRequest) {
  let keepOpen = false;
  let manual = false;
  try {
    const body = await req.json();
    keepOpen = body?.keepOpen === true;
    manual   = body?.manual   === true;
  } catch { /* body is optional */ }

  // Immediately set status so the frontend knows login is in progress
  portalSessionStore.sessionStatus = 'login-pending';
  portalSessionStore.sessionError = null;
  portalSessionStore.manualMode = manual;
  portalSessionStore.manualStep = 0;
  portalSessionStore.manualStepError = null;

  // ── Manual mode: only launch the browser (step 1), then hand control to UI ──
  if (manual) {
    void (async () => {
      try {
        await step1_launch((msg) => console.log('[Portal login step 1]', msg));
        portalSessionStore.manualStep = 1;
      } catch (err) {
        portalSessionStore.sessionStatus = 'login-error';
        portalSessionStore.sessionError = err instanceof Error ? err.message : 'Step 1 failed';
        portalSessionStore.manualStep = 0;
      }
    })();
    return NextResponse.json({ started: true, manual: true });
  }

  // ── Auto mode: run the full pipeline asynchronously ──────────────────────────
  // Run asynchronously — the browser opens and the user completes SSO.
  // The frontend polls GET /api/scraper/status to detect completion.
  void (async () => {
    try {
      const { cookieHeader, portalToken } = await captureLoginSession((msg) => {
        console.log('[Portal login]', msg);
      }, keepOpen);

      portalSessionStore.cookies = cookieHeader;
      portalSessionStore.portalToken = portalToken;
      portalSessionStore.sessionStatus = 'logged-in';
      portalSessionStore.sessionError = null;

      saveSession();

      // Pre-fetch full student list so search is instant from the first query
      await fetchAndStoreStudents({ cookies: cookieHeader, portalToken });
      console.log(`[Portal] Student list loaded: ${portalStore.students.length} students`);
    } catch (err) {
      console.error('[Portal login] Failed:', err);
      portalSessionStore.sessionStatus = 'login-error';
      portalSessionStore.sessionError = err instanceof Error ? err.message : 'Login failed';
    }
  })();

  return NextResponse.json({ started: true });
}
