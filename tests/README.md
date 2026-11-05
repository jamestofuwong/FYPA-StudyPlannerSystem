# Tests

Run the fast checks with `npm run verify` (typecheck, lint, docs check, unit tests). Run everything with `npm run verify:full` or `npm run test:all`. Each layer has its own command.

| Layer | Command | What it checks | Needs |
|---|---|---|---|
| Unit | `npm test` (`tests/unit`, `tests/core`) | Rules and algorithms: matching, scheduling, graduation, pathway, grades, import parsing, copilot workflows | nothing |
| Contract | `npm test` (`tests/unit/navigation-registry`, `electron-ipc-contract`, `copilot/workflow-registry`) | Files that must agree: panel registry, Electron IPC channels and window security flags, copilot workflow registry | nothing |
| Component | `npm test` (`tests/ui`) | React components and pages in jsdom | nothing |
| API (mocked) | `npm test` (`tests/api`) | HTTP status codes and validation of the route handlers, with the data layer mocked | nothing |
| Integration | `npm run test:integration` (`tests/integration-db`) | Migrations, seed data, repositories, route handlers and planning pipelines against a real PostgreSQL | nothing (starts its own throw-away database) |
| Student app | `npm run test:student` and `npm run test:student:integration` (`student/tests`) | The student web app: components, auth, and CMS access against a real PostgreSQL | nothing |
| End-to-end | `npm run test:e2e` (`e2e/`) | The advisor UI in Chromium, both designs, against a real PostgreSQL with the production seed data | `npx playwright install chromium` once |

The integration and end-to-end tests start an embedded PostgreSQL in a temporary folder (`tests/helpers/embeddedDb.js`). They never touch your app data and need no Docker.

## AI Copilot routing

- `tests/unit/copilot/routing-prompts.data.ts` holds what an advisor really types: at least 4 prompts for every workflow, in different styles (formal, casual, lower case, indirect, with university slang), plus the parameters that must be extracted.
- `routing-prompts.test.ts` runs them through the real router and the real workflow registry with a stand-in model. It checks that the expected workflow is among the candidates and in the top 5, and that parameters are extracted or reported missing.
- `routing-ollama.test.ts` runs the same prompts with the real model. It is skipped unless you set `RUN_OLLAMA_TESTS=1` and Ollama is running. Run it before you change the model, the routing prompt or a workflow description.
- `router-improvements.test.ts` covers planner names ("the Data Science planner" becomes a planner id), "this semester", replies that are not clean, refusal of requests to change data, and messages that no workflow can answer.
- Both routing tests write their results to `ROUTING-RESULTS.md` and `ROUTING-OLLAMA-RESULTS.md` next to them (git-ignored, replaced on every run).
- A failing prompt means the router or a description must change. Do not change the prompt.

## Known gaps, pinned on purpose

- `test.failing(...)`: describes a bug that exists today (none is left today). The test passes while the bug exists and fails when someone fixes it. Change it to `test(...)` then.
- `KNOWN_*` lists in `tests/integration-db`: data issues in the seed files. A new entry in the real data fails the test. Remove an entry when the data is fixed.

## Not covered

- The packaged Electron app (window, auto-update, first-run database start-up). `tests/unit/electron-ipc-contract` checks the channels and security flags from the source only.
- Python PDF extractor, Ollama answers and the live university portal. They are mocked or left out because they need a model or a login.
- Student web app end-to-end in a browser.
- Visual regression, load and accessibility audits.
