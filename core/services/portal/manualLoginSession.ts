// ---------------------------------------------------------------------------
// manualLoginSession
//
// Exposes each step of the portal login pipeline as individual async functions
// so the user can trigger them one-by-one from the UI for debugging.
//
// Module-level browser/page references persist between API calls because
// Next.js runs in-process inside Electron — the same module instance is reused.
//
// Steps:
//   1. Launch browser → navigate to login page (user completes SSO manually)
//   2. Confirm SSO done → navigate to Degree1 (fallback: Dashboard1 → staportal → Degree1)
//   3. Load PortalExtension iframe (networkidle0, captures token)
//   4. Collect cookies + token, finalise session
// ---------------------------------------------------------------------------

import puppeteer, { type Browser, type Page } from 'puppeteer';

const PORTAL_LOGIN_URL =
  'https://sisportal-100380.campusnexus.cloud/CMCPortal/secure/Staff/loginsta.aspx';

const DEGREE1_URL =
  'https://sisportal-100380.campusnexus.cloud/CMCPortal/secure/links/Degree1.aspx?sm=1';

const FALLBACK_DASHBOARD1_URL =
  'https://sisportal-100380.campusnexus.cloud/CMCPortal/Secure/links/Dashboard1.aspx';

const FALLBACK_STUDENT_LOGIN_URL =
  'https://sisportal-100380.campusnexus.cloud/CMCPortal/secure/student/loginstu.aspx';

const FALLBACK_DEGREE1_URL =
  'https://sisportal-100380.campusnexus.cloud/CMCPortal/secure/links/Degree1.aspx';


const NAV_TIMEOUT_MS  = 60_000;
const IDLE_TIMEOUT_MS = 30_000;

// ─── Module-level Puppeteer state ────────────────────────────────────────────
// These survive between API route calls within the same Electron session.

let browser: Browser | null = null;
let page: Page | null = null;
let capturedToken: string | null = null;
let iframeSrc: string | null = null;

// ─── Step metadata ────────────────────────────────────────────────────────────

export type ManualStep = 0 | 1 | 2 | 3 | 4;

export const STEP_LABELS: Record<ManualStep, string> = {
  0: 'Idle',
  1: 'Browser open — complete SSO in the window',
  2: 'Navigated to Degree1 — iframe located',
  3: 'PortalExtension loaded — token captured',
  4: 'Session collected',
};

export interface ManualCaptureResult {
  cookieHeader: string;
  portalToken: string;
}

// ─── Step 1: Launch browser ───────────────────────────────────────────────────

export async function step1_launch(onStatus?: (msg: string) => void): Promise<void> {
  const log = (msg: string) => { onStatus?.(msg); console.log('[ManualLogin]', msg); };

  // Close any previous session
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
    page = null;
  }
  capturedToken = null;
  iframeSrc = null;

  log('Launching browser…');
  browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });

  page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  // Intercept all requests to capture the `token` header when Angular fires
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const token = req.headers()['token'];
    if (token && !capturedToken) {
      capturedToken = token;
      log('Portal token captured!');
    }
    req.continue();
  });

  log('Navigating to portal login page…');
  await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  log('Browser ready — complete SSO in the window, then click Step 2.');
}

// ─── Step 2: Navigate to Degree1 (with fallback if redirected away) ──────────

export async function step2_navigateDegree1(onStatus?: (msg: string) => void): Promise<void> {
  if (!page) throw new Error('No browser session — run Step 1 first.');
  const log = (msg: string) => { onStatus?.(msg); console.log('[ManualLogin]', msg); };

  log('Navigating to Degree1…');
  await page.goto(DEGREE1_URL, { waitUntil: 'domcontentloaded' });

  iframeSrc = await page.evaluate((): string | null => {
    const iframe = document.querySelector('iframe');
    return iframe?.src ?? null;
  });

  if (!iframeSrc) {
    log('Iframe not found — running fallback: Dashboard1 → loginstu → Degree1…');
    await page.goto(FALLBACK_DASHBOARD1_URL,    { waitUntil: 'domcontentloaded' });
    await page.goto(FALLBACK_STUDENT_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.goto(FALLBACK_DEGREE1_URL,       { waitUntil: 'domcontentloaded' });

    iframeSrc = await page.evaluate((): string | null => {
      const iframe = document.querySelector('iframe');
      return iframe?.src ?? null;
    });
  }

  if (!iframeSrc) throw new Error('Could not find PortalExtension iframe on Degree1.aspx');
  log(`Iframe found: ${iframeSrc}`);
}

// ─── Step 3: Load PortalExtension, wait for token ────────────────────────────

export async function step3_loadExtension(onStatus?: (msg: string) => void): Promise<void> {
  if (!page)      throw new Error('No browser session — run Step 1 first.');
  if (!iframeSrc) throw new Error('No iframe src — run Step 2 first.');
  const log = (msg: string) => { onStatus?.(msg); console.log('[ManualLogin]', msg); };

  log('Loading PortalExtension (waiting for networkidle0)…');
  await page.goto(iframeSrc, { waitUntil: 'networkidle0', timeout: IDLE_TIMEOUT_MS });

  if (!capturedToken) {
    throw new Error('Token not captured — Angular startup requests may not have fired.');
  }
  log('Token captured successfully.');
}

// ─── Step 4: Collect cookies and finalise session ─────────────────────────────

export async function step4_collect(
  keepOpen: boolean,
  onStatus?: (msg: string) => void,
): Promise<ManualCaptureResult> {
  if (!browser)       throw new Error('No browser session — run Step 1 first.');
  if (!capturedToken) throw new Error('No token — run Step 3 first.');
  const log = (msg: string) => { onStatus?.(msg); console.log('[ManualLogin]', msg); };

  log('Collecting session cookies…');
  const cookies = await browser.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  if (!cookieHeader) throw new Error('No cookies captured after login.');

  const result: ManualCaptureResult = {
    cookieHeader,
    portalToken: capturedToken,
  };

  capturedToken = null;
  iframeSrc = null;

  if (keepOpen) {
    log('Session captured — browser kept open for debugging.');
  } else {
    await browser.close();
    browser = null;
    page = null;
  }

  return result;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export async function resetManualSession(): Promise<void> {
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
  }
  page = null;
  capturedToken = null;
  iframeSrc = null;
}
