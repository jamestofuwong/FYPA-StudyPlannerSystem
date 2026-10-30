# Testing

The short version for people is `tests/README.md`. This file is the version for agents.

## Layers and commands

| Layer | Command | Folder | Needs |
|---|---|---|---|
| Unit, contract, component, mocked API | `npm test` | `tests/unit`, `tests/core`, `tests/ui`, `tests/api` | Nothing |
| Integration (real PostgreSQL) | `npm run test:integration` | `tests/integration-db` | Nothing. `tests/helpers/embeddedDb.js` starts a throw-away database. |
| Student app | `npm run test:student`, `npm run test:student:integration` | `student/tests` (CMS accounts: `student/tests/unit/permissions.test.ts`, `student/tests/integration/cms-accounts.test.ts`) | Nothing. Run from the root. They use `student/jest.config.js`. |
| End-to-end (Chromium) | `npm run test:e2e` | `e2e/` (the walkthroughs: `e2e/walkthrough.spec.ts`; the student app and its CMS accounts: `e2e/student`) | `npx playwright install chromium` once |
| Real-model routing (opt in) | `RUN_OLLAMA_TESTS=1 npx jest tests/unit/copilot/routing-ollama.test.ts` | `tests/unit/copilot` | Ollama running on port 11435 with `qwen2.5:3b` |
| Scenario suite (50 students) | `SCENARIO_DB_URL=<url> npx jest tests/scenarios` | `tests/scenarios` | A database with the planners. Skipped without the variable. |
| Python | `core/services/plannerImport/.venv/bin/python -m unittest discover -s tests/unit/plannerImport -p "test_*.py"` | `tests/unit/plannerImport`, `tests/integration/plannerImport` | The Python virtual environment |
| Performance | `npx jest tests/performance` | `tests/performance` | Nothing (the matching test has a 5 s limit) |

Jest config: `jest.config.js` (next/jest, `testEnvironment: node`; component tests add `/** @jest-environment jsdom */`). Integration config: `jest.integration.config.js` (one worker, a global setup that starts PostgreSQL). Aliases `@/`, `@core/`, `@shared/`, `@student/` match `tsconfig.json`.

## Contract tests

These files must agree, and a test reads the source to check:

| Test | Rule |
|---|---|
| `tests/unit/navigation-registry.test.ts` | Every id in `PANEL_IDS` has a path, a page folder, a tab label, a status-bar label and a Meadow icon. Labels agree. |
| `tests/unit/electron-ipc-contract.test.ts` | Every channel the preload invokes has a handler. Every listened event is sent by main. Only the six documented objects are exposed. Security flags stay on. |
| `tests/unit/copilot/workflow-registry.test.ts` | Every workflow file is registered, ids are unique, descriptions are well formed, every parameter is one the extractor understands. |
| `tests/unit/copilot/workflowLinks.test.ts` | Every workflow appears in the link table. |

## Known gaps, written down on purpose

- `test.failing(...)` describes wanted behaviour for a bug that exists today. It passes while the bug exists and **fails when the bug is fixed**. Then change it to `test(...)`. No `test.failing` is left today: the create and update routes now check their body (see `web/lib/requestBody.ts`).
- `KNOWN_*` lists in `tests/integration-db` name seed-data problems with a reason. Today they hold only the old unit code `ICT20016*Optional` that a seed file keeps on purpose. Two seed problems that the tests found are fixed: `SWE30011` and `COS30015` now accept either first-year web unit (COS10011 in the 2022 planners, COS10026 later), and the Internet of Things September 2024 planner has its `COS30049` back (a trailing space in the seed file dropped it). The seed loader (`add_template_units`) now fails on an unknown unit code. A new entry in the real data fails the test. Remove an entry when you fix the data.
- `get-database-url` is a handler that no preload function uses. It is pinned.

## Status

Every test passes. Two suites are skipped on purpose: the scenario suite (needs `SCENARIO_DB_URL`) and the real-model routing test (needs `RUN_OLLAMA_TESTS=1`). `npm run lint` and `npm run typecheck` are clean. A failure is a result of your change. Fix it, or fix the test if the behaviour changed on purpose (and say so).

`npm run verify` runs typecheck, lint, the docs check and `npm test`. `npm run verify:full` adds the integration, student and browser tests.

## How to write a test

- A pure function: plain input and output. Do not mock it.
- A route: call its exported function with a `Request`. For route plus database, put the test in `tests/integration-db` and call the route without mocks.
- In a `jest.mock` factory, create the mock functions inside the factory (Jest moves `jest.mock` above the imports).
- Do not call the real portal or Ollama. Mock `puppeteer`, `fetch` and the portal service.
- A component: `render` and `screen`. Set `designPreference` in `localStorage` to test Easy and Classic. jsdom has no layout: set `clientHeight`, `scrollHeight` and `scrollTop` by hand.
- Name a test after the rule: "a Conceded Pass cannot satisfy a prerequisite".
- Fix a bug in two steps: add a test that fails, then fix the code.
- Check a new test by breaking the code on purpose. A test that still passes protects nothing.

## Copilot routing tests

Details are in [the copilot README](../../core/services/copilot/README.md). Short form: `tests/unit/copilot/routing-prompts.data.ts` holds what an advisor types (at least four prompts for every workflow). `routing-prompts.test.ts` runs them through the real router with a stand-in model and writes `ROUTING-RESULTS.md`. `routing-ollama.test.ts` runs them with the real model and writes `ROUTING-OLLAMA-RESULTS.md`. Both result files are git-ignored. If a prompt fails, change the router or a workflow description, not the prompt.

## CI

`.github/workflows/tests.yml` has four jobs: typecheck, docs check and lint; unit tests; integration tests (desktop and student); and end-to-end tests. All of them block.

## User acceptance testing

The plan and the form are in `docs/UAT.md` and `docs/UAT-form.html`. Both are generated from `docs/uat/uat-data.js` by `npm run docs:uat`. Edit the data file, not the two outputs. Every case points to a client requirement (R1 to R11), and the acceptance rule is: all Must cases pass and no Critical or Major defect is open.
