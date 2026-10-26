/**
 * The CMS login, refresh and logout routes against a real PostgreSQL. A bug here is a security bug, so the tests check the
 * database as well as the response: what is stored, what is rotated, and what a stolen token can still do.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST as login } from '@/app/api/cms/auth/login/route';
import { POST as refresh } from '@/app/api/cms/auth/refresh/route';
import { POST as logout } from '@/app/api/cms/auth/logout/route';
import { hashPassword, hashToken, verifyAccessToken } from '@/lib/cms/auth';
import { resetRateLimit } from '@/lib/cms/rateLimit';

const EMAIL = 'editor@example.com';
const PASSWORD = 'correct horse battery staple';
let ipCounter = 0;
const newIp = () => `10.0.0.${++ipCounter}`;

const post = (path: string, body?: unknown, opts: { ip?: string; cookies?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': opts.ip ?? newIp() };
  if (opts.cookies) headers.cookie = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest(`http://localhost${path}`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
};
const cookiesOf = (res: Response) => {
  const out: Record<string, { value: string; attrs: string }> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';');
    const i = pair.indexOf('=');
    out[pair.slice(0, i).trim()] = { value: pair.slice(i + 1), attrs: attrs.join(';').toLowerCase() };
  }
  return out;
};
const doLogin = (opts: { ip?: string; password?: string; email?: string } = {}) =>
  login(post('/api/cms/auth/login', { email: opts.email ?? EMAIL, password: opts.password ?? PASSWORD }, { ip: opts.ip }));

beforeEach(async () => {
  await prisma.cmsRefreshToken.deleteMany();
  await prisma.cmsUser.deleteMany();
  await prisma.cmsUser.create({ data: { email: EMAIL, name: 'Editor', password_hash: await hashPassword(PASSWORD) } });
  resetRateLimit(`email:${EMAIL}`);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

describe('login', () => {
  test('a correct login sets an access cookie and a refresh cookie, both HttpOnly', async () => {
    const res = await doLogin();
    expect(res.status).toBe(200);
    const c = cookiesOf(res);
    expect(Object.keys(c).sort()).toEqual(['cms_access', 'cms_refresh']);
    for (const name of ['cms_access', 'cms_refresh']) {
      expect(c[name].attrs).toContain('httponly');
      expect(c[name].attrs).toContain('samesite=lax');
    }
    expect(await verifyAccessToken(c.cms_access.value)).toMatchObject({ email: EMAIL, name: 'Editor' });
  });

  test('the refresh token is stored only as a hash, with a 7-day expiry', async () => {
    const c = cookiesOf(await doLogin());
    const rows = await prisma.cmsRefreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(c.cms_refresh.value));
    expect(rows[0].token_hash).not.toBe(c.cms_refresh.value);
    const days = (rows[0].expires_at.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  test('a wrong password gives 401 and creates no token', async () => {
    const res = await doLogin({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
    expect(await prisma.cmsRefreshToken.count()).toBe(0);
    expect(cookiesOf(res)).toEqual({});
  });

  test('an unknown e-mail gets the same answer as a wrong password (no way to find which accounts exist)', async () => {
    const wrongPassword = await doLogin({ password: 'wrong' });
    const unknownUser = await doLogin({ email: 'nobody@example.com' });
    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(await unknownUser.json()).toEqual(await wrongPassword.json());
  });

  test('a bad request gives 400 before the database is touched', async () => {
    const spy = jest.spyOn(prisma.cmsUser, 'findUnique');
    expect((await login(post('/api/cms/auth/login', { email: 'not-an-email', password: 'x' }))).status).toBe(400);
    expect((await login(post('/api/cms/auth/login', { email: { $ne: null }, password: { $ne: null } }))).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  test('the e-mail is matched without regard to letter case, because two accounts cannot differ only by case', async () => {
    expect((await doLogin({ email: 'EDITOR@example.com' })).status).toBe(200);
  });

  test('a deactivated account cannot sign in, and gets the same answer as a wrong password', async () => {
    await prisma.cmsUser.update({ where: { email: EMAIL }, data: { active: false } });
    const res = await doLogin();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
    expect(await prisma.cmsRefreshToken.count()).toBe(0);
  });

  test('a deactivated account cannot refresh an existing session', async () => {
    const c = cookiesOf(await doLogin());
    await prisma.cmsUser.update({ where: { email: EMAIL }, data: { active: false } });
    expect((await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: c.cms_refresh.value } }))).status).toBe(401);
  });
});

describe('rate limit', () => {
  test('after five failures from one address, even the correct password is refused with 429 and a wait time', async () => {
    const ip = newIp();
    for (let i = 0; i < 5; i++) expect((await doLogin({ ip, password: 'wrong' })).status).toBe(401);
    const blocked = await doLogin({ ip });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Try again in \d+ seconds/);
    expect(await prisma.cmsRefreshToken.count()).toBe(0);
  });

  test('five failures against one account from different addresses block that account', async () => {
    for (let i = 0; i < 5; i++) await doLogin({ password: 'wrong' });
    expect((await doLogin()).status).toBe(429);
  });

  test('a good login clears the counters', async () => {
    const ip = newIp();
    for (let i = 0; i < 4; i++) await doLogin({ ip, password: 'wrong' });
    expect((await doLogin({ ip })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await doLogin({ ip, password: 'wrong' })).status).toBe(401);
  });
});

describe('refresh', () => {
  const loggedIn = async () => { const c = cookiesOf(await doLogin()); return { access: c.cms_access.value, refresh: c.cms_refresh.value }; };

  test('a valid refresh token gives new cookies, and the old refresh token stops working', async () => {
    const first = await loggedIn();
    const res = await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: first.refresh } }));
    expect(res.status).toBe(200);
    const next = cookiesOf(res);
    expect(next.cms_refresh.value).not.toBe(first.refresh);
    expect(await verifyAccessToken(next.cms_access.value)).toMatchObject({ email: EMAIL });

    const replay = await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: first.refresh } }));
    expect(replay.status).toBe(401);                                    // a stolen, already used token is useless
  });

  test('refreshing replaces the stored token: there is still exactly one row', async () => {
    const first = await loggedIn();
    await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: first.refresh } }));
    const rows = await prisma.cmsRefreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(hashToken(first.refresh));
  });

  test('an expired refresh token is refused', async () => {
    const first = await loggedIn();
    await prisma.cmsRefreshToken.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });
    expect((await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: first.refresh } }))).status).toBe(401);
  });

  test('no cookie, and a token that was never issued, are refused', async () => {
    expect((await refresh(post('/api/cms/auth/refresh'))).status).toBe(401);
    expect((await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: 'f'.repeat(64) } }))).status).toBe(401);
  });

  test('an access token cannot be used as a refresh token', async () => {
    const first = await loggedIn();
    expect((await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: first.access } }))).status).toBe(401);
  });
});

describe('logout', () => {
  test('removes the refresh token from the database and clears both cookies', async () => {
    const c = cookiesOf(await doLogin());
    const res = await logout(post('/api/cms/auth/logout', undefined, { cookies: { cms_access: c.cms_access.value, cms_refresh: c.cms_refresh.value } }));
    expect(res.status).toBe(200);
    expect(await prisma.cmsRefreshToken.count()).toBe(0);
    const cleared = cookiesOf(res);
    expect(cleared.cms_access.value).toBe('');
    expect(cleared.cms_refresh.value).toBe('');
    // after logout the old refresh token cannot get a new session
    expect((await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: c.cms_refresh.value } }))).status).toBe(401);
  });

  test('logging out with no cookies still succeeds', async () => {
    expect((await logout(post('/api/cms/auth/logout'))).status).toBe(200);
  });

  test('logging out one session does not end another session of the same user', async () => {
    const a = cookiesOf(await doLogin()), b = cookiesOf(await doLogin());
    await logout(post('/api/cms/auth/logout', undefined, { cookies: { cms_refresh: a.cms_refresh.value } }));
    expect((await refresh(post('/api/cms/auth/refresh', undefined, { cookies: { cms_refresh: b.cms_refresh.value } }))).status).toBe(200);
  });
});

describe('data rules', () => {
  test('deleting a user deletes the refresh tokens of that user', async () => {
    await doLogin();
    expect(await prisma.cmsRefreshToken.count()).toBe(1);
    await prisma.cmsUser.deleteMany();
    expect(await prisma.cmsRefreshToken.count()).toBe(0);
  });

  test('an e-mail address is unique', async () => {
    await expect(prisma.cmsUser.create({ data: { email: EMAIL, name: 'Copy', password_hash: 'x' } })).rejects.toThrow();
  });
});
