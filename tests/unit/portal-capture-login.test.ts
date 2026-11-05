/**
 * The portal login in two steps: a visible browser for the sign-in, then a hidden browser that carries the cookies on.
 * The portal can answer slowly (or differently) on another computer or network, so the hidden step must say where it is,
 * try a slow page once more, and look like the visible browser. A stand-in browser is used: no real portal, no window.
 */
import { EventEmitter } from 'node:events';

const PORTAL = 'https://sisportal-100380.campusnexus.cloud/CMCPortal';
const VISIBLE_UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/150.0.0.0 Safari/537.36';

type GotoBehaviour = (url: string, attempt: number) => Promise<unknown>;

function fakePage(startUrl: string, gotoBehaviour: GotoBehaviour, iframeSequence: Array<string | null> = []) {
  const page = new EventEmitter() as EventEmitter & Record<string, any>;
  let current = startUrl;
  const attempts = new Map<string, number>();
  page.url = () => current;
  page.setDefaultNavigationTimeout = jest.fn();
  page.setRequestInterception = jest.fn(async () => {});
  page.setUserAgent = jest.fn(async () => {});
  page.setCookie = jest.fn(async () => {});
  page.goto = jest.fn(async (url: string) => {
    const n = (attempts.get(url) ?? 0) + 1;
    attempts.set(url, n);
    const result = await gotoBehaviour(url, n);
    current = url;
    // the PortalExtension page sends the token header when it starts
    if (url.includes('PortalExtension')) page.emit('request', { headers: () => ({ token: 'tok-123' }), continue: jest.fn() });
    return result ?? { status: () => 200 };
  });
  page.waitForFunction = jest.fn(async () => {});
  page.evaluate = jest.fn(async () => (iframeSequence.length ? iframeSequence.shift() : null));
  return page;
}

function fakeBrowser(page: any, opts: { userAgent?: string } = {}) {
  return {
    pages: jest.fn(async () => [page]),
    newPage: jest.fn(async () => page),
    cookies: jest.fn(async () => [{ name: 'ASP.NET_SessionId', value: 'abc' }, { name: 'sso', value: 'xyz' }]),
    userAgent: jest.fn(async () => opts.userAgent ?? 'HeadlessChrome/150'),
    close: jest.fn(async () => {}),
    waitForFunction: jest.fn(),
  };
}

function timeout() { const e = new Error('Navigation timeout of 60000 ms exceeded'); e.name = 'TimeoutError'; return e; }

async function run(hiddenGoto: GotoBehaviour, iframe: Array<string | null>) {
  const visiblePage = fakePage(`${PORTAL}/secure/links/Dashboard1.aspx`, async () => undefined);
  const hiddenPage = fakePage('about:blank', hiddenGoto, iframe);
  const visible = fakeBrowser(visiblePage, { userAgent: VISIBLE_UA });
  const hidden = fakeBrowser(hiddenPage);
  const launch = jest.fn().mockResolvedValueOnce(visible).mockResolvedValueOnce(hidden);
  jest.resetModules();
  jest.doMock('puppeteer', () => ({ __esModule: true, default: { launch } }));
  const { captureLoginSession } = await import('../../core/services/portal/captureLoginSession');
  const log: string[] = [];
  const result = await captureLoginSession((m) => log.push(m), false).then((r) => ({ ok: true as const, r }), (e) => ({ ok: false as const, e }));
  return { result, log, hiddenPage, visible, hidden };
}

describe('portal login: the hidden browser step', () => {
  const IFRAME = `${PORTAL}/PortalExtension/index.html`;

  test('the hidden browser uses the user agent of the visible browser and gets the sign-in cookies', async () => {
    const { result, hiddenPage } = await run(async () => undefined, [IFRAME]);
    expect(result.ok).toBe(true);
    expect(hiddenPage.setUserAgent).toHaveBeenCalledWith({ userAgent: VISIBLE_UA });
    expect(hiddenPage.setCookie).toHaveBeenCalledTimes(1);
    if (result.ok) expect(result.r).toEqual({ cookieHeader: 'ASP.NET_SessionId=abc; sso=xyz', portalToken: 'tok-123' });
  });

  test('a slow page that times out once is tried again, and the log says which step and where', async () => {
    // No iframe on the first Degree1, so the fallback runs. The second Degree1 times out once (the report from the field).
    const { result, log } = await run(async (url, attempt) => {
      if (/Degree1\.aspx$/.test(url) && attempt === 1) throw timeout();
    }, [null, IFRAME]);
    expect(result.ok).toBe(true);
    expect(log.some((l) => /Iframe not found/.test(l))).toBe(true);
    expect(log.some((l) => /Degree1 \(second try\) failed \(try 1 of 2\).*Navigation timeout/.test(l))).toBe(true);
    expect(log.some((l) => /Degree1 \(second try\): HTTP 200/.test(l))).toBe(true);
  });

  test('when the page keeps timing out, the error is raised after one more try and the log names the step', async () => {
    const { result, log, hidden } = await run(async (url) => {
      if (/Degree1\.aspx$/.test(url)) throw timeout();
    }, [null]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result.e as Error).name).toBe('TimeoutError');
    expect(log.filter((l) => /Degree1 \(second try\) failed/.test(l))).toHaveLength(2);
    expect(hidden.close).toHaveBeenCalled();           // the hidden browser is always closed
  });

  test('an error that is not a timeout is not retried', async () => {
    const { result, log } = await run(async (url) => {
      if (/Dashboard1/.test(url)) throw new Error('net::ERR_NAME_NOT_RESOLVED');
    }, [null]);
    expect(result.ok).toBe(false);
    expect(log.filter((l) => /Dashboard1 failed/.test(l))).toHaveLength(1);
  });
});
