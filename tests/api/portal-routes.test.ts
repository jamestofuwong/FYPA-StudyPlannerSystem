/** @jest-environment node */
/**
 * Portal API routes with the portal session mocked. These check the HTTP contract that the Data Scraping page relies on:
 * 401 when logged out, 400 for bad input, 401 for an expired portal session, 502 for a portal failure.
 */
jest.mock('../../core/services/portal/portalSessionService', () => {
  class PortalAuthError extends Error {}
  return {
    PortalAuthError,
    getStatus: jest.fn(), fetchDegreeAudit: jest.fn(), fetchEnrollments: jest.fn(), getStudents: jest.fn(),
    loginAuto: jest.fn(), loginManualStep1: jest.fn(), loginAdvanceStep: jest.fn(), logout: jest.fn(),
  };
});
import * as realSvc from '../../core/services/portal/portalSessionService';
const svc = realSvc as unknown as Record<string, jest.Mock> & { PortalAuthError: new (m: string) => Error };
const PortalAuthError = svc.PortalAuthError;

import { POST as portalFetch } from '../../web/app/api/scraper/portal-fetch/route';
import { POST as portalEnrollments } from '../../web/app/api/scraper/portal-enrollments/route';
import { GET as portalStudents } from '../../web/app/api/scraper/portal-students/route';
import { POST as login } from '../../web/app/api/scraper/login/route';
import { POST as loginAdvance } from '../../web/app/api/scraper/login-advance/route';
import { POST as logout } from '../../web/app/api/scraper/logout/route';
import { scraperStore } from '../../web/app/api/scraper/store';

const post = (body?: unknown, raw?: string) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }) as never;
const loggedIn = (yes: boolean) => svc.getStatus.mockReturnValue({ sessionStatus: yes ? 'logged-in' : 'idle' });

beforeEach(() => {
  jest.clearAllMocks();
  scraperStore.status = 'idle';
  scraperStore.result = null;
});

describe('POST /api/scraper/portal-fetch', () => {
  test('401 when not logged in, and the portal is not called', async () => {
    loggedIn(false);
    const res = await portalFetch(post({ dbId: 1, enrollID: 2 }));
    expect(res.status).toBe(401);
    expect(svc.fetchDegreeAudit).not.toHaveBeenCalled();
  });

  test('400 for invalid JSON', async () => {
    loggedIn(true);
    expect((await portalFetch(post(undefined, '{nope'))).status).toBe(400);
  });

  test.each([[{}], [{ dbId: 1 }], [{ enrollID: 2 }], [{ dbId: 0, enrollID: 2 }]])('400 when ids are missing: %j', async (body) => {
    loggedIn(true);
    expect((await portalFetch(post(body))).status).toBe(400);
    expect(svc.fetchDegreeAudit).not.toHaveBeenCalled();
  });

  test('success returns the student and stores it for the polling scraper', async () => {
    loggedIn(true);
    svc.fetchDegreeAudit.mockResolvedValue({ studentName: 'Alex' });
    const res = await portalFetch(post({ dbId: 7, enrollID: 9, studentNumber: '102780123' }));
    expect(await res.json()).toEqual({ ok: true, student: { studentName: 'Alex' } });
    expect(svc.fetchDegreeAudit).toHaveBeenCalledWith(7, 9, '102780123');
    expect(scraperStore.status).toBe('done');
    expect(scraperStore.result).toEqual({ studentName: 'Alex' });
  });

  test('the student number defaults to an empty string', async () => {
    loggedIn(true);
    svc.fetchDegreeAudit.mockResolvedValue({});
    await portalFetch(post({ dbId: 7, enrollID: 9 }));
    expect(svc.fetchDegreeAudit).toHaveBeenCalledWith(7, 9, '');
  });

  test('an expired portal session gives 401; any other failure gives 502 with the message', async () => {
    loggedIn(true);
    svc.fetchDegreeAudit.mockRejectedValueOnce(new PortalAuthError('Session expired'));
    const expired = await portalFetch(post({ dbId: 1, enrollID: 2 }));
    expect(expired.status).toBe(401);
    expect((await expired.json()).error).toBe('Session expired');

    svc.fetchDegreeAudit.mockRejectedValueOnce(new Error('portal down'));
    const down = await portalFetch(post({ dbId: 1, enrollID: 2 }));
    expect(down.status).toBe(502);
    expect((await down.json()).error).toBe('portal down');
    expect(scraperStore.status).toBe('idle');                    // a failed fetch must not look like a finished one
  });
});

describe('POST /api/scraper/portal-enrollments', () => {
  test('401 when logged out', async () => {
    loggedIn(false);
    expect((await portalEnrollments(post({ dbId: 1 }))).status).toBe(401);
  });

  test.each([[{}], [{ dbId: '5' }], [{ dbId: 0 }]])('400 for a missing or non-numeric dbId: %j', async (body) => {
    loggedIn(true);
    expect((await portalEnrollments(post(body))).status).toBe(400);
  });

  test('returns the enrollments; an empty list comes with a message', async () => {
    loggedIn(true);
    svc.fetchEnrollments.mockResolvedValueOnce([{ EnrollId: 1, EnrollmentDesc: 'BCS' }]);
    expect(await (await portalEnrollments(post({ dbId: 3 }))).json()).toEqual({ enrollments: [{ EnrollId: 1, EnrollmentDesc: 'BCS' }] });

    svc.fetchEnrollments.mockResolvedValueOnce([]);
    const empty = await (await portalEnrollments(post({ dbId: 3 }))).json();
    expect(empty.enrollments).toEqual([]);
    expect(empty.error).toMatch(/no enrollments/i);
  });

  test('maps auth failures to 401 and other failures to 502', async () => {
    loggedIn(true);
    svc.fetchEnrollments.mockRejectedValueOnce(new PortalAuthError('expired'));
    expect((await portalEnrollments(post({ dbId: 3 }))).status).toBe(401);
    svc.fetchEnrollments.mockRejectedValueOnce(new Error('boom'));
    expect((await portalEnrollments(post({ dbId: 3 }))).status).toBe(502);
  });
});

describe('GET /api/scraper/portal-students', () => {
  test('401 when logged out, list and total when logged in', async () => {
    loggedIn(false);
    expect((await portalStudents()).status).toBe(401);
    loggedIn(true);
    svc.getStudents.mockReturnValue([{ student_id: '1', name: 'A', db_id: 1 }, { student_id: '2', name: 'B', db_id: 2 }]);
    expect(await (await portalStudents()).json()).toMatchObject({ total: 2 });
  });
});

describe('login routes', () => {
  test('automatic login starts and passes keepOpen only when it is exactly true', async () => {
    await login(post({ keepOpen: true }));
    expect(svc.loginAuto).toHaveBeenLastCalledWith({ keepOpen: true });
    await login(post({ keepOpen: 'yes' }));
    expect(svc.loginAuto).toHaveBeenLastCalledWith({ keepOpen: false });
  });

  test('a missing body is allowed and means automatic login', async () => {
    const res = await login(post(undefined, ''));
    expect(await res.json()).toEqual({ started: true });
    expect(svc.loginAuto).toHaveBeenCalledTimes(1);
  });

  test('manual login starts step 1 only', async () => {
    const res = await login(post({ manual: true }));
    expect(await res.json()).toEqual({ started: true, manual: true });
    expect(svc.loginManualStep1).toHaveBeenCalledTimes(1);
    expect(svc.loginAuto).not.toHaveBeenCalled();
  });

  test.each([[undefined], [1], [5], [0]])('login-advance rejects step %p with 400', async (step) => {
    expect((await loginAdvance(post({ step }))).status).toBe(400);
    expect(svc.loginAdvanceStep).not.toHaveBeenCalled();
  });

  test('login-advance rejects invalid JSON with 400', async () => {
    expect((await loginAdvance(post(undefined, '{'))).status).toBe(400);
  });

  test('login-advance returns the step label, 401 for auth errors, 500 for others', async () => {
    svc.loginAdvanceStep.mockResolvedValueOnce({ label: 'Password' });
    expect(await (await loginAdvance(post({ step: 3, keepOpen: true }))).json()).toEqual({ ok: true, step: 3, label: 'Password' });
    expect(svc.loginAdvanceStep).toHaveBeenCalledWith(3, true);

    svc.loginAdvanceStep.mockRejectedValueOnce(new PortalAuthError('bad password'));
    expect((await loginAdvance(post({ step: 3 }))).status).toBe(401);
    svc.loginAdvanceStep.mockRejectedValueOnce(new Error('timeout'));
    expect((await loginAdvance(post({ step: 4 }))).status).toBe(500);
  });

  test('logout clears the session', async () => {
    expect(await (await logout()).json()).toEqual({ ok: true });
    expect(svc.logout).toHaveBeenCalledTimes(1);
  });
});
