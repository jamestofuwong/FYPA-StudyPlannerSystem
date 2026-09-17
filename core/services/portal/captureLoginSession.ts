// ---------------------------------------------------------------------------
// captureLoginSession
//
// Opens a headed (visible) Puppeteer browser so the user can complete
// Microsoft SSO, then navigates through the portal to capture:
//   - All session cookies (as a single Cookie header string)
//   - The `token` header value sent by the Angular PortalExtension app
//
// This is a one-time operation. After it succeeds, all subsequent portal
// API calls use plain fetch() with the captured credentials.
// ---------------------------------------------------------------------------

import puppeteer, { type Browser, type Page } from 'puppeteer';

// ─── Portal URL constants ──────────────────────────────────────────────────

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


const MICROSOFT_LOGIN_HOST = 'login.microsoftonline.com';

const SSO_TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes for user to complete SSO
const NAV_TIMEOUT_MS  = 60 * 1000;      // 60s per navigation step
const IDLE_TIMEOUT_MS = 30 * 1000;      // 30s networkidle0 wait

export interface CaptureResult {
  cookieHeader: string;
  portalToken: string;
}

function isMicrosoftLoginUrl(url: string): boolean {
  try {
    return new URL(url).hostname === MICROSOFT_LOGIN_HOST;
  } catch {
    return false;
  }
}

export async function captureLoginSession(
  onStatus?: (msg: string) => void,
  keepOpen = false,
): Promise<CaptureResult> {
  const log = (msg: string) => onStatus?.(msg);

  log('Launching browser for portal login…');

  const browser: Browser = await puppeteer.launch({
    headless: false, // Visible so the user can complete SSO
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });

  let capturedToken: string | null = null;

  try {
    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // ── Step 1: Intercept requests to capture the `token` header ────────────
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const token = req.headers()['token'];
      if (token && !capturedToken) {
        capturedToken = token;
        log('Portal token captured.');
      }
      req.continue();
    });

    // ── Step 2: Navigate to portal login page ────────────────────────────────
    log('Navigating to portal…');
    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // ── Step 3: Wait for Microsoft SSO to complete (up to 10 minutes) ────────
    if (isMicrosoftLoginUrl(page.url())) {
      log('Microsoft SSO detected — waiting for you to log in…');
      await page.waitForFunction(
        (msHost: string) => !window.location.hostname.includes(msHost),
        { timeout: SSO_TIMEOUT_MS },
        MICROSOFT_LOGIN_HOST,
      );
      log('SSO complete.');
    }

    // ── Step 4: Navigate to Degree1 and extract iframe src ───────────────────
    log('Navigating to Degree1…');
    await page.goto(DEGREE1_URL, { waitUntil: 'domcontentloaded' });

    let iframeSrc = await page.evaluate((): string | null => {
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

    if (!iframeSrc) {
      throw new Error('Could not find PortalExtension iframe on Degree1.aspx');
    }
    log(`Found PortalExtension iframe: ${iframeSrc}`);

    // ── Step 5: Load PortalExtension — triggers Angular startup requests ──────
    // networkidle0 ensures Angular fires all its initialisation API calls,
    // which carry the `token` header that the interceptor captures.
    log('Loading PortalExtension (waiting for Angular startup)…');
    await page.goto(iframeSrc, { waitUntil: 'networkidle0', timeout: IDLE_TIMEOUT_MS });

    if (!capturedToken) {
      throw new Error('Portal token was not captured — Angular startup requests may not have fired.');
    }

    // ── Step 6: Collect all cookies ──────────────────────────────────────────
    log('Collecting session cookies…');
    const cookies = await browser.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    if (!cookieHeader) {
      throw new Error('No cookies captured after login.');
    }

    log('Session captured successfully.');
    return { cookieHeader, portalToken: capturedToken };

  } finally {
    if (keepOpen) {
      log('Browser kept open for debugging — close it manually when done.');
    } else {
      await browser.close();
    }
  }
}
