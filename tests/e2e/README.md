# Browser E2E tests

Tests are grouped by feature: `planners.test.cjs`, `dashboard.test.cjs`, `class-estimation.test.cjs`, `cms.test.cjs`, and `copilot.test.cjs`. Shared fixtures, browser utilities and isolated server/database setup live in `helpers/`.

## Core workflows with real APIs and disposable databases

Run `npm run test:e2e:core-flows`. This provisions a fresh embedded PostgreSQL cluster with separate desktop/student databases, applies the desktop migrations and student schema, creates an ephemeral CMS user, starts isolated Next.js servers, and runs the feature files below. It stops its servers and database afterwards. Database URLs and credentials come from the runner; no university portal login is needed.

Requirements: root and student dependencies installed/generated, Puppeteer's browser installed, and the planner extractor Python requirements installed. The runner defaults to `core/services/plannerImport/.venv`; set `E2E_PYTHON` to override the interpreter. Test-only server configuration and fixtures live in `helpers/`; each run uses a unique build directory and restores Next-generated declarations when unchanged by other work.

Feature files are `planners.test.cjs`, `dashboard.test.cjs`, `class-estimation.test.cjs`, and `cms.test.cjs`. The real flow in each file requires the core-flows runner and is reported as skipped without it. The existing mocked Class Estimation tests stay in that same file and also run against the isolated server.

To rerun one feature with the same isolated setup, use `npm run test:e2e:core-flows -- --feature=dashboard` (or another feature name from the list above, without `.test.cjs`).

Coverage:

- Actual synthetic PDF extraction, planner save, database reopen/reload, and duplicate rejection.
- Synthetic transcript import, real matching, graduation audit, and generation of the one outstanding pathway unit.
- Actual DPA cohort import, independently expected estimation totals, persisted saved run, HoD report reload, and a browser-downloaded Excel workbook whose values and absence of student IDs are checked.
- Real CMS anonymous access guard, invalid/valid credentials, FAQ save/reload/public visibility, logout, and access guard after logout.

Desktop and CMS API responses, matching, extraction, estimation, exports, authentication, and database writes are real. All student data is synthetic. The runner retains its temporary workspace for diagnosis and prints its location; it contains synthetic fixtures and the disposable databases. Browser workflow files are excluded from Jest and must be run with their dedicated commands.

The Class Estimation suite also checks an interrupted transcript stream (error shown, estimate/save remain disabled, successful retry) and failed deletion (error shown, saved estimate preserved, successful retry).

## AI Copilot

With the app running, use `npm run test:e2e:copilot` for six browser scenarios: sending replies, pending-request controls, history/reload/new/delete chat, unsupported and login-required replies, connection recovery, Ollama availability, and model setup. API responses are synthetic; these tests require no portal login or running model.

Run `npm run test:copilot:core` for the real chat handler and router with synthetic workflows and stubbed model/portal dependencies. It covers workflow execution, student access guards, missing parameters, invalid workflow selection, model/workflow errors, and request validation. It does not measure real-model routing accuracy or contact the portal.

Start the desktop UI with `npm run dev`, then run in another terminal:

```powershell
npm run test:e2e:class-estimation
```

The suite uses the existing Puppeteer dependency and its Chromium installation. To target another development server, set `E2E_BASE_URL` (default `http://127.0.0.1:3000`). Each test opens a fresh browser and closes it afterwards.

Coverage: generated transcript loading, disabled controls before loading, preview request settings, summary figures, unit search/sorting/pagination, elective/student/check tabs, student drill-down, intake warnings, input validation, save failures and retries, label-only save payloads, saved-run details, Excel link destination, and removal.

These are browser workflow tests with intercepted API responses. They exercise the real page and components with synthetic data, without contacting the university portal or writing to a database. They do not verify estimation calculations, database persistence, or Excel file contents. Those need service/API integration coverage. No screenshots or browser traces containing student details are saved.
