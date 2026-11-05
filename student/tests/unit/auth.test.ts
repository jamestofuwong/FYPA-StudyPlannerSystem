import bcrypt from 'bcryptjs';
import {
  ACCESS_COOKIE_OPTIONS, REFRESH_COOKIE_OPTIONS, ACCESS_MAX_AGE, REFRESH_MAX_AGE,
  signAccessToken, verifyAccessToken, generateRefreshToken, hashToken, refreshExpiresAt, hashPassword, verifyPassword, safeVerifyPassword,
} from '@/lib/cms/auth';

const user = { sub: 'user-1', email: 'editor@example.com', name: 'Editor' };

describe('access token (JWT)', () => {
  test('a signed token verifies and returns the same user', async () => {
    expect(await verifyAccessToken(await signAccessToken(user))).toEqual(user);
  });

  test('a token that was changed is rejected', async () => {
    const token = await signAccessToken(user);
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), email: 'admin@evil.test' })).toString('base64url');
    expect(await verifyAccessToken(`${h}.${forged}.${s}`)).toBeNull();
  });

  test('a token signed with another secret is rejected', async () => {
    const token = await signAccessToken(user);
    const original = process.env.CMS_JWT_SECRET;
    process.env.CMS_JWT_SECRET = 'a-completely-different-secret-value-0000';
    try { expect(await verifyAccessToken(token)).toBeNull(); } finally { process.env.CMS_JWT_SECRET = original; }
  });

  test('a token expires after 15 minutes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T00:00:00Z'));
    try {
      const token = await signAccessToken(user);
      jest.setSystemTime(new Date('2026-10-01T00:14:30Z'));
      expect(await verifyAccessToken(token)).not.toBeNull();
      jest.setSystemTime(new Date('2026-10-01T00:15:30Z'));
      expect(await verifyAccessToken(token)).toBeNull();
    } finally { jest.useRealTimers(); }
  });

  test('empty, garbage and "alg none" tokens are rejected', async () => {
    expect(await verifyAccessToken('')).toBeNull();
    expect(await verifyAccessToken('not.a.jwt')).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x', email: 'a', name: 'b' })).toString('base64url')}.`;
    expect(await verifyAccessToken(none)).toBeNull();
  });

  test('signing needs a secret', async () => {
    const original = process.env.CMS_JWT_SECRET;
    delete process.env.CMS_JWT_SECRET;
    try { await expect(signAccessToken(user)).rejects.toThrow(/CMS_JWT_SECRET/); } finally { process.env.CMS_JWT_SECRET = original; }
  });
});

describe('refresh token', () => {
  test('each token is 64 hex characters and different from the last', () => {
    const a = generateRefreshToken(), b = generateRefreshToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  test('the stored form is a SHA-256 hash that does not contain the token', () => {
    const t = generateRefreshToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });

  test('it expires in 7 days', () => {
    const ms = refreshExpiresAt().getTime() - Date.now();
    expect(ms).toBeGreaterThan(REFRESH_MAX_AGE * 1000 - 5000);
    expect(ms).toBeLessThanOrEqual(REFRESH_MAX_AGE * 1000);
  });
});

describe('passwords', () => {
  test('a password hash is bcrypt with cost 12, and verifies only the right password', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  test('the same password gives a different hash each time (salted)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  test('safeVerifyPassword is false for an unknown user, and still runs bcrypt (so the response time does not reveal the account)', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    expect(await safeVerifyPassword('anything', null)).toBe(false);
    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  test('safeVerifyPassword is true only for the right password of a known user', async () => {
    const hash = await hashPassword('right');
    expect(await safeVerifyPassword('right', hash)).toBe(true);
    expect(await safeVerifyPassword('wrong', hash)).toBe(false);
  });
});

describe('cookies', () => {
  test('both cookies are HttpOnly, SameSite=Lax and last as long as their token', () => {
    for (const [o, age] of [[ACCESS_COOKIE_OPTIONS, ACCESS_MAX_AGE], [REFRESH_COOKIE_OPTIONS, REFRESH_MAX_AGE]] as const) {
      expect(o).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: age });
    }
  });

  test('the secure flag is on in production and off in development', () => {
    const load = (env: string) => {
      const was = process.env.NODE_ENV; (process.env as Record<string, string>).NODE_ENV = env;
      try { let m!: typeof import('@/lib/cms/auth'); jest.isolateModules(() => { m = require('@/lib/cms/auth'); }); return m; }
      finally { (process.env as Record<string, string>).NODE_ENV = was!; }
    };
    expect(load('production').ACCESS_COOKIE_OPTIONS.secure).toBe(true);
    expect(load('production').REFRESH_COOKIE_OPTIONS.secure).toBe(true);
    expect(load('development').ACCESS_COOKIE_OPTIONS.secure).toBe(false);
  });
});
