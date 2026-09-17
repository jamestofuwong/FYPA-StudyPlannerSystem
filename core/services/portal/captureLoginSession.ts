// ---------------------------------------------------------------------------
// captureLoginSession
//
// Opens a headed (visible) Puppeteer browser so the user can complete
// Microsoft SSO, then navigates through the portal to capture:
//   - All session cookies (as a single Cookie header string)
//   - The `token` header value sent by the Angular PortalExtension app
//
// Normal flow (keepOpen = false):
//   Phase 1 — Headed browser: user completes SSO, cookies captured, browser closed.
//   Phase 2 — Headless browser: portal navigation continues invisibly in background.
//
// Debug flow (keepOpen = true):
//   Single headed browser stays open for all steps (original behaviour).
// ---------------------------------------------------------------------------

import puppeteer, { type Browser, type Page, type CookieParam } from 'puppeteer';

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

// ─── Portal navigation (shared between headed and headless phase) ─────────────

async function runPortalNavigation(
  page: Page,
  log: (msg: string) => void,
  onTokenCaptured: (token: string) => void,
): Promise<string> {
  await page.setRequestInterception(true);
  let captured = false;
  page.on('request', (req) => {
    const token = req.headers()['token'];
    if (token && !captured) {
      captured = true;
      onTokenCaptured(token);
      log('Portal token captured.');
    }
    req.continue();
  });

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

  log('Loading PortalExtension (waiting for Angular startup)…');
  await page.goto(iframeSrc, { waitUntil: 'networkidle0', timeout: IDLE_TIMEOUT_MS });

  return iframeSrc;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function captureLoginSession(
  onStatus?: (msg: string) => void,
  keepOpen = false,
): Promise<CaptureResult> {
  const log = (msg: string) => onStatus?.(msg);

  // ── Debug mode: single headed browser stays open throughout ─────────────────
  if (keepOpen) {
    log('Launching browser (debug mode — window will stay open)…');
    const browser: Browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null,
    });

    let capturedToken: string | null = null;

    try {
      const page: Page = await browser.newPage();
      page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

      log('Navigating to portal…');
      await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded' });

      if (isMicrosoftLoginUrl(page.url())) {
        log('Microsoft SSO detected — waiting for you to log in…');
        await page.waitForFunction(
          (msHost: string) => !window.location.hostname.includes(msHost),
          { timeout: SSO_TIMEOUT_MS },
          MICROSOFT_LOGIN_HOST,
        );
        log('SSO complete.');
      }

      await runPortalNavigation(page, log, (token) => { capturedToken = token; });

      if (!capturedToken) {
        throw new Error('Portal token was not captured — Angular startup requests may not have fired.');
      }

      log('Collecting session cookies…');
      const cookies = await browser.cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      if (!cookieHeader) throw new Error('No cookies captured after login.');

      log('Session captured. Browser kept open for debugging — close it manually when done.');
      return { cookieHeader, portalToken: capturedToken };
    } catch (err) {
      await browser.close();
      throw err;
    }
    // Browser intentionally NOT closed in normal exit (keepOpen = true)
  }

  // ── Normal mode ─────────────────────────────────────────────────────────────
  // Phase 1: Headed browser — visible only for SSO. Closed as soon as SSO is done.

  log('Launching browser for portal login…');
  const headedBrowser: Browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });

  let ssoCookies: CookieParam[] = [];

  try {
    const page: Page = await headedBrowser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    log('Navigating to portal…');
    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    if (isMicrosoftLoginUrl(page.url())) {
      log('Microsoft SSO detected — waiting for you to log in…');
      await page.waitForFunction(
        (msHost: string) => !window.location.hostname.includes(msHost),
        { timeout: SSO_TIMEOUT_MS },
        MICROSOFT_LOGIN_HOST,
      );
      log('SSO complete.');
    }

    // Capture SSO cookies before closing the visible browser
    ssoCookies = await headedBrowser.cookies() as CookieParam[];
  } finally {
    await headedBrowser.close();
    log('Browser closed — continuing session capture in background…');
  }

  // Phase 2: Headless browser — invisible, carries SSO cookies forward.

  log('Starting background session capture…');
  const headlessBrowser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let capturedToken: string | null = null;

  try {
    const page: Page = await headlessBrowser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Transfer SSO cookies into the headless session
    if (ssoCookies.length > 0) {
      await page.setCookie(...ssoCookies);
    }

    await runPortalNavigation(page, log, (token) => { capturedToken = token; });

    if (!capturedToken) {
      throw new Error('Portal token was not captured — Angular startup requests may not have fired.');
    }

    log('Collecting session cookies…');
    const cookies = await headlessBrowser.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    if (!cookieHeader) throw new Error('No cookies captured after login.');

    log('Session captured successfully.');
    return { cookieHeader, portalToken: capturedToken };
  } finally {
    await headlessBrowser.close();
  }
}
