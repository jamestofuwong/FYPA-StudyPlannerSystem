# Student application E2E tests

Run from `student/`:

```powershell
npm run test:e2e:full
```

This provisions a fresh local PostgreSQL database, applies the student schema, seeds the public catalogue/help content and an ephemeral CMS account, then starts test-owned Next.js servers. It runs desktop/mobile development workflows and a separate production-build CSP/hydration suite. Existing `.env` credentials and regular databases are not used as test targets. No portal login is needed. Application/core source is unchanged.

Requirements: root and student dependencies installed, generated Prisma clients, and Playwright Chromium installed (`npx playwright install chromium`). The runner uses the root's embedded PostgreSQL package and shared test-only Next server helper. It prints its synthetic workspace location and stops its servers/database after completion. Next-generated declarations are restored when their changes are test-generated only. Run one isolated suite at a time.

Useful variants:

```powershell
npm run test:e2e:full -- --dev-only
npm run test:e2e:full -- --production-only
npm run test:e2e:full -- --dev-only --grep "unit CRUD"
npm run test:e2e:typecheck
```

| File | Main happy/unhappy paths |
|---|---|
| `student-navigation-and-planners.spec.ts` | Existing public navigation; planner/unit search, filters, pagination, details, prerequisites, not-found recovery; builder configuration, completion history and draft restoration; generation 404/500; FAQ and support links |
| `public-extra.spec.ts` | Desktop/mobile navigation and layout, network failure/retry, malformed builder draft |
| `plan-builder-extra.spec.ts` | A controlled three-unit prerequisite chain; exact generated unit set, prerequisites before dependents, offering-term restrictions, load cap, no duplicated completed units; actual request validation and missing planner |
| `cms-auth.spec.ts` | Protected pages, tampered/expired access cookies, invalid/valid login, cookie flags, refresh rotation and replay rejection, expired refresh, logout, request validation and rate limiting |
| `cms-units.spec.ts` | Unit create/edit/delete; all detail tabs and three requisite types; database/public verification; invalid fields/assessment totals; referenced-unit deletion; failed-save retry; pending official-detail cancel/keep/use decisions |
| `cms-planners.spec.ts` | Planner create/edit/delete with placements/elective pool; database/public verification; invalid course, duplicate semesters/units, move/remove semester controls, list filters and delete cancellation |
| `cms-help.spec.ts` | FAQ validation/create/edit/reorder/delete; contacts save/reload/public visibility; department-head validation/create/delete/public visibility |
| `security.production.spec.ts` | Fresh CSP nonces, script nonces, and working interactions on production planners, units, builder and help pages |

CMS mutations and direct fixture writes require the isolated runner. They are skipped by an ordinary `npm run test:e2e` session. Assertions remain enabled when an application defect is found; tests do not modify app logic to pass. Public cache assertions allow stale-while-revalidate to complete through subsequent reads.

Most requests use the real browser, API, server actions, authentication, services and database. Explicit 404/500/network tests simulate failures at the browser boundary. Official-detail review uses staged synthetic snapshots and never calls the university site. No real student data is used. Failure screenshots and traces contain synthetic data only; do not run this mutation suite against a shared/deployed database.

This covers the main user and CMS workflows, not every possible input or every browser engine. Production failures or mobile failures must be addressed in app code separately before claiming those flows are reliable.

Failure artifacts and JSON reports are separated under `test-results/student-full/development/` and `test-results/student-full/production/` at the repository root so a production run does not erase development failures.

Validation on 2026-10-29: 40 development tests passed; two mobile tests failed because other controls intercepted taps (Help navigation and Generate Study Plan). All four production interaction checks failed: planner/unit search did not update, the builder major selector did not enable, and the FAQ did not expand. These remain enabled failures for application owners to investigate. E2E TypeScript checking passed. The initial development run's artifacts are directly under `test-results/student-full/`; subsequent runs use the phase subdirectories above.
