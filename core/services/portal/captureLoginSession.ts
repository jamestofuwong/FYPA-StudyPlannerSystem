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

const PORTAL_HOST = 'sisportal-100380.campusnexus.cloud';

const SSO_TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes for user to complete SSO
const NAV_TIMEOUT_MS  = 60 * 1000;      // 60s per navigation step
const IDLE_TIMEOUT_MS = 30 * 1000;      // 30s networkidle0 wait

export interface CaptureResult {
  cookieHeader: string;
  portalToken: string;
}

function isSsoInProgress(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const onPortal = hostname.includes(PORTAL_HOST);
    const onLoginPage = pathname.toLowerCase().includes('login');
    return !onPortal || onLoginPage;
  } catch {
    return true;
  }
}

// ─── Navigation helper ─────────────────────────────────────────────────────────

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Opens a page, says where it ended up, and tries a slow page one more time. On another computer or network the portal
 * can answer slowly or send the hidden browser somewhere else. The log then shows which step and which address.
 */
async function go(
  page: Page,
  url: string,
  label: string,
  log: (msg: string) => void,
  options: { waitUntil: 'domcontentloaded' | 'networkidle0'; timeout?: number } = { waitUntil: 'domcontentloaded' },
): Promise<void> {
  const ATTEMPTS = 2;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await page.goto(url, options);
      log(`${label}: HTTP ${res?.status() ?? '?'}, now at ${shortUrl(page.url())}`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      log(`${label} failed (try ${attempt} of ${ATTEMPTS}): ${message}. The browser is at ${shortUrl(page.url())}.`);
      if (!timedOut || attempt === ATTEMPTS) throw err;
    }
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
  await go(page, DEGREE1_URL, 'Degree1', log);

  let iframeSrc = await page.evaluate((): string | null => {
    const iframe = document.querySelector('iframe');
    return iframe?.src ?? null;
  });

  if (!iframeSrc) {
    log('Iframe not found — running fallback: Dashboard1 → loginstu → Degree1…');
    await go(page, FALLBACK_DASHBOARD1_URL,    'Dashboard1', log);
    await go(page, FALLBACK_STUDENT_LOGIN_URL, 'loginstu',   log);
    await go(page, FALLBACK_DEGREE1_URL,       'Degree1 (second try)', log);

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
  await go(page, iframeSrc, 'PortalExtension', log, { waitUntil: 'networkidle0', timeout: IDLE_TIMEOUT_MS });

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
      // Reuse the default about:blank tab instead of opening a second one
      const existingPages = await browser.pages();
      const page: Page = existingPages[0] ?? await browser.newPage();
      page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

      log('Navigating to portal…');
      await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded' });

      if (isSsoInProgress(page.url())) {
        log('Waiting for login to complete…');
        await page.waitForFunction(
          (portalHost: string) =>
            window.location.hostname.includes(portalHost) &&
            !window.location.pathname.toLowerCase().includes('login'),
          { timeout: SSO_TIMEOUT_MS },
          PORTAL_HOST,
        );
        log('Login complete.');
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
  let userAgent: string | null = null;

  try {
    // Reuse the default about:blank tab instead of opening a second one
    const existingPages = await headedBrowser.pages();
    const page: Page = existingPages[0] ?? await headedBrowser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    log('Navigating to portal…');
    await page.goto(PORTAL_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    if (isSsoInProgress(page.url())) {
      log('Waiting for login to complete…');
      await page.waitForFunction(
        (portalHost: string) =>
          window.location.hostname.includes(portalHost) &&
          !window.location.pathname.toLowerCase().includes('login'),
        { timeout: SSO_TIMEOUT_MS },
        PORTAL_HOST,
      );
      log('Login complete.');
    }

    // Capture SSO cookies before closing the visible browser
    ssoCookies = await headedBrowser.cookies() as CookieParam[];
    // The hidden browser would otherwise call itself "HeadlessChrome", and the portal can answer that differently.
    userAgent = await headedBrowser.userAgent().catch(() => null);
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

    if (userAgent) await page.setUserAgent({ userAgent });
    log(`Background browser: ${userAgent ?? 'default user agent'}`);

    // Transfer SSO cookies into the headless session
    if (ssoCookies.length > 0) {
      await page.setCookie(...ssoCookies);
      log(`Carried ${ssoCookies.length} sign-in cookies into the background browser.`);
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
