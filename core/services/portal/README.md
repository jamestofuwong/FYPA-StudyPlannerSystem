# portal: university portal access

Gets student data from the university portal (CampusNexus). The desktop app has no copy of the data. It logs in with Puppeteer and then calls the REST API.

## Entry points

- `portalSessionService.ts`: the one service that owns the session. Exposes `loginAuto`, `loginManualStep1`, `loginAdvanceStep`, `logout`, `getStatus`, `getStudents`, `searchStudents`, `fetchEnrollments` and `fetchDegreeAudit`. The state is a singleton on `globalThis`. The cookies and token are saved in a file under `APP_DATA_DIR` and restored at start.
- `portalFetch.ts`: an authenticated fetch. Every call needs the session cookies, the Angular anti-forgery `token`, and matching `Referer`, `Origin` and `X-Requested-With` headers. Throws `PortalAuthError` when the session has expired.
- `captureLoginSession.ts`, `manualLoginSession.ts`: the Puppeteer login (automatic, and the manual step-by-step flow).
- Routes: `web/app/api/scraper/{login,login-advance,logout,portal-students,portal-enrollments,portal-fetch}`.
- Client state: `web/components/providers/PortalAuthContext.tsx`, `StudentSessionContext.tsx`.

## Rules

- Student data is held in memory only (privacy rule). Do not write it to the database, a log or a file.
- Importing `portalSessionService` has a side effect: it restores a saved session and calls the real portal to reload the student list. Mock it in tests and never import it in a script.
- Routes map errors the same way: 401 when not logged in or when the session expired (`PortalAuthError`), 400 for bad input, 502 for a portal failure.
- `enrollMode` chooses the enrollment: latest (default), earliest or mpu (`core/services/copilot/workflows/enrollmentSelector.ts`).

## Tests

`tests/api/portal-routes.test.ts` (mocked service). There is no test that reaches the real portal.
