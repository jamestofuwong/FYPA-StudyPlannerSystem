/**
 * plannerScraperAdapter.ts
 *
 * Defines the BrowserAdapter interface — the cloud equivalent of the local
 * app's WebviewAdapter. Any browser backend (Puppeteer, Playwright, jsdom
 * for tests) can implement this interface, keeping the scraper service itself
 * backend-agnostic.
 *
 * The PuppeteerAdapter is the production implementation.
 *
 * Install dependency: npm install puppeteer
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BrowserAdapter {
  /** Navigate to a URL and wait for the network to settle. */
  navigate(url: string, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'): Promise<void>;

  /** Execute a JS string in the page context and return the result. */
  evaluate<T = unknown>(script: string): Promise<T>;

  /** Return the current page URL. */
  getURL(): string;

  /**
   * Wait for a CSS selector to appear in the DOM.
   * Returns true if found within the timeout, false if it timed out.
   */
  waitForSelector(selector: string, timeoutMs?: number): Promise<boolean>;

  /**
   * Perform a plain HTTP fetch from the Node.js process (not the browser
   * page). Used for downloading binary files (PDFs) server-side.
   */
  fetchBuffer(url: string): Promise<{ buffer: Buffer; contentType: string; sizeBytes: number }>;

  /** Tear down the browser instance. Should be called when done. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Puppeteer implementation
// ---------------------------------------------------------------------------

/**
 * Creates a PuppeteerAdapter. Lazily imports puppeteer so the module can
 * still be imported in environments where puppeteer is not installed
 * (e.g. when using a mock adapter in tests).
 *
 * Usage:
 *   const adapter = await createPuppeteerAdapter({ headless: true });
 *   // ... use adapter ...
 *   await adapter.close();
 */
export async function createPuppeteerAdapter(opts: {
  headless?: boolean;
  executablePath?: string; // Override Chrome path (e.g. for puppeteer-core)
  userAgent?: string;
} = {}): Promise<BrowserAdapter> {
  // Dynamic import — avoids hard compile-time dep when mocking.
  // webpackIgnore/turbopackIgnore prevents Turbopack from statically tracing
  // this import; the package is declared in serverExternalPackages so it is
  // required at runtime from cloud/node_modules rather than bundled.
  //
  // rebrowser-puppeteer is a patched fork of Puppeteer that fixes bot-detection
  // leaks at the CDP protocol level (headless flag, Runtime.enable timing,
  // navigator.webdriver, etc.) that puppeteer-extra-plugin-stealth cannot reach.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // @ts-ignore — rebrowser-puppeteer lives in cloud/node_modules; not resolvable from repo root tsconfig
  const puppeteer = await import(/* webpackIgnore: true */ 'rebrowser-puppeteer');

  const launchOpts: Record<string, unknown> = {
    headless: opts.headless ?? true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Important in Docker/VPS environments
      '--disable-gpu',
    ],
  };
  if (opts.executablePath) launchOpts.executablePath = opts.executablePath;

  const browser = await puppeteer.default.launch(launchOpts);
  const page = await browser.newPage();

  // Set a realistic user agent to avoid bot detection
  const ua = opts.userAgent
    ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  await page.setUserAgent(ua);

  // Allow large responses (PDFs can be several MB)
  await page.setDefaultNavigationTimeout(60_000);
  await page.setDefaultTimeout(30_000);

  return {
    async navigate(url, waitUntil = 'networkidle2') {
      await page.goto(url, { waitUntil });
    },

    async evaluate<T>(script: string): Promise<T> {
      return page.evaluate(script) as Promise<T>;
    },

    getURL() {
      return page.url();
    },

    async waitForSelector(selector, timeoutMs = 15_000) {
      try {
        await page.waitForSelector(selector, { timeout: timeoutMs });
        return true;
      } catch {
        return false;
      }
    },

    async fetchBuffer(url) {
      // Uses Node's built-in fetch (Node 18+) rather than the browser page,
      // so it runs in the server process. Inherits no browser cookies — if
      // PDFs require auth, use page.evaluate + fetch instead.
      const res = await globalThis.fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        buffer,
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        sizeBytes: buffer.byteLength,
      };
    },

    async close() {
      await browser.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Mock adapter — for unit tests
// ---------------------------------------------------------------------------

export interface MockAdapterOptions {
  url?: string;
  evaluateResponses?: Map<string, unknown>; // keyed by substring of script
}

/**
 * Returns a lightweight mock adapter for use in tests.
 * Wire up evaluateResponses to return pre-canned results per script.
 */
export function createMockAdapter(opts: MockAdapterOptions = {}): BrowserAdapter {
  let currentUrl = opts.url ?? 'https://mock.test/';

  return {
    async navigate(url) { currentUrl = url; },

    async evaluate<T>(script: string): Promise<T> {
      if (opts.evaluateResponses) {
        for (const [key, value] of opts.evaluateResponses) {
          if (script.includes(key)) return value as T;
        }
      }
      return { success: false, error: 'No mock response configured for this script' } as T;
    },

    getURL() { return currentUrl; },

    async waitForSelector() { return true; },

    async fetchBuffer(url) {
      return { buffer: Buffer.alloc(0), contentType: 'application/pdf', sizeBytes: 0, url };
    },

    async close() { /* no-op */ },
  };
}
