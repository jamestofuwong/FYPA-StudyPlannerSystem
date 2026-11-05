import { NextRequest } from 'next/server';
import { proxy as middleware, config } from '@/proxy';
import { signAccessToken } from '@/lib/cms/auth';

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://students.example.com${path}`, cookie ? { headers: { cookie } } : undefined);
const validCookie = async () => `cms_access=${await signAccessToken({ sub: 'u1', email: 'e@x.co', name: 'E' })}`;

describe('CMS gate', () => {
  test('a CMS page without a login redirects to the login page, and remembers where the person was going', async () => {
    const res = await middleware(request('/cms/planners/new'));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/cms/login');
    expect(to.searchParams.get('next')).toBe('/cms/planners/new');
  });

  test('the CMS home page is protected too', async () => {
    expect((await middleware(request('/cms'))).headers.get('location')).toContain('/cms/login');
  });

  test('the login page and the auth API stay open (otherwise nobody could log in)', async () => {
    for (const path of ['/cms/login', '/api/cms/auth/login', '/api/cms/auth/refresh']) {
      const res = await middleware(request(path));
      expect(res.headers.get('location')).toBeNull();
    }
  });

  test('a valid access token opens a CMS page', async () => {
    const res = await middleware(request('/cms/dashboard', await validCookie()));
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  test.each(['cms_access=garbage', 'cms_access=', 'cms_access=a.b.c', 'other_cookie=1'])('a bad access cookie (%s) does not open a CMS page', async (cookie) => {
    expect((await middleware(request('/cms/dashboard', cookie))).status).toBe(307);
  });

  test('an expired token does not open a CMS page', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T00:00:00Z'));
    try {
      const cookie = await validCookie();
      jest.setSystemTime(new Date('2026-10-01T00:20:00Z'));
      expect((await middleware(request('/cms/dashboard', cookie))).status).toBe(307);
    } finally { jest.useRealTimers(); }
  });

  test('the public student pages need no login', async () => {
    for (const path of ['/', '/planners', '/units/COS10009', '/plan-builder', '/help']) {
      expect((await middleware(request(path))).headers.get('location')).toBeNull();
    }
  });

  test('the redirect for a blocked page also carries the Content-Security-Policy', async () => {
    expect((await middleware(request('/cms/dashboard'))).headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});

describe('Content-Security-Policy', () => {
  const csp = async (path = '/') => (await middleware(request(path))).headers.get('content-security-policy')!;

  test('is on every response and blocks framing, plugins and other origins', async () => {
    const policy = await csp();
    for (const d of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", 'upgrade-insecure-requests']) {
      expect(policy).toContain(d);
    }
  });

  test('scripts run only with a nonce that is new for every request', async () => {
    const [a, b] = [await csp(), await csp()];
    const nonce = (p: string) => /script-src 'self' 'nonce-([^']+)'/.exec(p)?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
    expect(a).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  test("'unsafe-eval' is allowed in development only", async () => {
    expect(await csp()).toContain("'unsafe-eval'");                                  // the test run is not production
    const original = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try { expect(await csp()).not.toContain('unsafe-eval'); } finally { (process.env as Record<string, string>).NODE_ENV = original!; }
  });

  test('the matcher skips the static files that do not need a policy', () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test('/_next/static/chunks/a.js')).toBe(false);
    expect(re.test('/favicon.ico')).toBe(false);
    expect(re.test('/cms/dashboard')).toBe(true);
    expect(re.test('/api/planners')).toBe(true);
  });
});

// Next.js takes the nonce for its own inline scripts from the Content-Security-Policy header of the REQUEST. With the
// policy only on the response, every script is blocked and the page never works (a production bug in October 2026).
describe('Content-Security-Policy nonce', () => {
  const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];

  test('the app receives the policy on the request, with the same nonce that the browser gets', async () => {
    const res = await middleware(request('/units'));
    const forApp = res.headers.get('x-middleware-request-content-security-policy');
    expect(forApp).toBeTruthy();
    expect(nonceOf(forApp)).toBeTruthy();
    expect(nonceOf(forApp)).toBe(nonceOf(res.headers.get('content-security-policy')));
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(forApp));
  });

  test('every request gets a new nonce', async () => {
    const a = nonceOf((await middleware(request('/'))).headers.get('content-security-policy'));
    const b = nonceOf((await middleware(request('/'))).headers.get('content-security-policy'));
    expect(a).not.toBe(b);
  });

  test('the policy allows scripts only by nonce, never unsafe-inline', async () => {
    const csp = (await middleware(request('/'))).headers.get('content-security-policy')!;
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  test('the login redirect carries the policy too', async () => {
    expect((await middleware(request('/cms/dashboard'))).headers.get('content-security-policy')).toContain("'nonce-");
  });
});
