# AGENTS.md

Read this file first. It is short on purpose. Read the linked documents only when your task needs them.

## What this repository is

One Git repository, two products:

- **Desktop app** (advisors): Electron 41 shell, Next.js 16 UI and API (`web/`), shared logic (`core/`), embedded PostgreSQL, a local Ollama model and a Python PDF extractor. It runs on one computer and has no server.
- **Student web app** (`student/`): a normal Next.js 16 site on Vercel with a Supabase database. It has its own `package.json`, Prisma 7 schema and tests. It reuses only `core/shared` and `core/services/scheduling`.

Privacy rule: the desktop app never stores student records. Student data lives in memory only. Only study planner data goes into the database.

## Commands

Run from the repository root unless a line says otherwise. The full list is generated: [docs/ai/generated/commands-and-pipelines.md](docs/ai/generated/commands-and-pipelines.md).

| Task | Command | Notes |
|---|---|---|
| Install | `npm install` | `postinstall` applies `patches/` and runs `prisma generate`. |
| Run the desktop app | `npm run dev` | Next.js on port 3000, tsup watch, Electron. First start downloads Ollama. |
| Type check | `npm run typecheck` | Must stay clean. |
| Lint | `npm run lint` | Clean. Keep it clean. |
| Unit, component, API tests | `npm test` | Fast. No database. |
| Integration tests | `npm run test:integration` | Starts a throw-away PostgreSQL. No setup. |
| Student app tests | `npm run test:student` and `npm run test:student:integration` | Run from the root. They use `student/jest.config.js`. |
| Browser tests | `npm run test:e2e` | Needs `npx playwright install chromium` once. |
| Check the docs | `npm run docs:check` | Run before you finish. |
| **Check everything fast** | `npm run verify` | Typecheck, lint, docs check and the fast tests. Run it before you finish. |
| Check everything | `npm run verify:full` | `verify`, then the integration, student and browser tests. |
| Student app | `cd student && npm install && npm run dev` | Needs `student/.env` (see [config-and-secrets](docs/ai/config-and-secrets.md)). |

## Layout and the one dependency rule

```
electron/   main process + preload bridge (2 files)
runtime/    processes that the app starts: postgres/, ollama/
web/        Next.js app for the desktop UI and its API (app/(pages), app/api, components, styles, lib)
core/       shared code: shared/ (pure), services/<feature>/, db/ (Prisma + repositories), config/
student/    the student web app (own package.json)
tests/      Jest tests;  e2e/ Playwright;  scripts/ tool scripts;  docs/ documentation
```

A layer calls only the layer below it: page, then API route, then service, then repository, then Prisma. `core/shared` is pure (no files, network or database). `core/` never imports `web/` or `electron/`. `web/` and `core/` never import `electron`. `student/` imports only `core/shared` and `core/services/scheduling`. `npm run docs:check` enforces these.

## This project is not standard Next.js

Do not "fix" these back to the usual way. Read [docs/ai/nextjs-differences.md](docs/ai/nextjs-differences.md) before you change build, routing or data code.

- Next.js runs inside the Electron main process. Every script passes `--webpack`. Keep it.
- The app is in `web/`, not at the root. Shared code is in `core/` outside the app folder.
- Desktop pages are Client Components that call `/api/*` route handlers. There are no Server Actions in the desktop app.
- Pages are "panels" in a client shell with tabs (`web/app/(pages)/layout.tsx`). A panel id is listed in five places (the `PanelId` type, `PANEL_IDS` and `PANEL_PATHS`, the tab bar, the status bar, the icon list). A test checks them. The sidebar item is not checked.
- Singletons on `globalThis` (portal session, Prisma client, estimation store) are intended.
- The Prisma client is generated to `node_modules/@local/prisma-client`, not `@prisma/client`.

## Hard rules

1. Never write student data to the database, a log or a file.
2. Change the database only with a Prisma migration (`core/db/prisma/schema/migrations`). Never edit a migration that has run. `base.prisma` and the migrations agree and `tests/integration-db/migrations.test.ts` keeps them so: check that the new `migration.sql` holds only your change (see [data-model.md](docs/ai/data-model.md)). Run `npm run prisma:generate` after a schema change.
3. A new function for the page that needs the operating system goes through the preload bridge. Update `tests/unit/electron-ipc-contract.test.ts`. Never expose `ipcRenderer`.
4. Do not call the real university portal or Ollama from a unit test. Importing `core/services/copilot/workflowRegistry` loads the portal service, which tries to restore a session and call the portal. Mock it (the copilot tests mock `puppeteer`).
5. Every student-app page must render per request. The Content-Security-Policy in `student/proxy.ts` uses a new nonce for each request, and Next.js can put it on its scripts only while it renders that request. `student/app/layout.tsx` calls `await connection()` for this. Do not make a student page static (`dynamic = 'force-static'`, `generateStaticParams` without care), and do not drop the policy from the request headers. Either one blocks every script, and the page does nothing when clicked. `e2e/student` tests this on a production build.
6. Never commit `.env` files or secret values. Use names only (see [config-and-secrets](docs/ai/config-and-secrets.md)).
7. The files in `docs/ai/generated/` are written by `npm run docs:facts`. Edit the code and regenerate. Never edit them by hand.

## How to verify a change

| You changed | Run |
|---|---|
| Any TypeScript | `npm run verify` |
| A rule in `core/services` | The matching folder in `tests/unit/<feature>`, then `npm test` |
| A route, a repository or the schema | `npm run test:integration` |
| A page or a component | `npm test`, and `npm run test:e2e` for a page |
| `electron/` | `npx jest tests/unit/electron-ipc-contract.test.ts`, then start `npm run dev` |
| The student app | `npm run test:student` and `npm run test:student:integration` |
| A copilot workflow, a description or the router | `npx jest tests/unit/copilot` (see [copilot README](core/services/copilot/README.md)) |
| Documentation | `npm run docs:facts` then `npm run docs:check` |

**Known failures.** None. Every test passes (the opt-in real-model routing test and the scenario suite are skipped unless you set their variables). A failing test is a result of your change.

## Where to look

Read the document for the area you work in. Do not read them all.

| If your task is about | Read first |
|---|---|
| How the parts fit together, start-up, layers | [docs/ai/architecture.md](docs/ai/architecture.md) |
| Routing, `next.config`, server or client code, env loading | [docs/ai/nextjs-differences.md](docs/ai/nextjs-differences.md) |
| The window, IPC, the preload, OS tasks, moving to the web | [docs/ai/electron-bridge.md](docs/ai/electron-bridge.md) |
| Schema, migrations, seed data, where data lives | [docs/ai/data-model.md](docs/ai/data-model.md) |
| Environment variables, secrets, rotation | [docs/ai/config-and-secrets.md](docs/ai/config-and-secrets.md) |
| Release, deploy, pipelines, rollback | [docs/ai/deployment.md](docs/ai/deployment.md) |
| Writing or running tests, known gaps | [docs/ai/testing.md](docs/ai/testing.md) |
| A word you do not know (panel, Easy, CP grade) | [docs/ai/glossary.md](docs/ai/glossary.md) |
| Major detection | [core/services/matching/README.md](core/services/matching/README.md) |
| Graduation audit | [core/services/graduation/README.md](core/services/graduation/README.md) |
| Pathway scheduling | [core/services/scheduling/README.md](core/services/scheduling/README.md) |
| Planner PDF import (Python) | [core/services/plannerImport/README.md](core/services/plannerImport/README.md) |
| The AI Copilot | [core/services/copilot/README.md](core/services/copilot/README.md) |
| Class estimation | [core/services/classEstimation/README.md](core/services/classEstimation/README.md) |
| Portal login and data | [core/services/portal/README.md](core/services/portal/README.md) |
| The old webview scraper | [core/services/scrapper/README.md](core/services/scrapper/README.md) |
| Excel export | [core/services/export/README.md](core/services/export/README.md) |
| Prisma, repositories | [core/db/README.md](core/db/README.md) |
| Shared types, grades, plan files | [core/shared/README.md](core/shared/README.md) |
| Embedded PostgreSQL, Ollama | [runtime/README.md](runtime/README.md) |
| `electron/main.ts`, `preload.ts` | [electron/README.md](electron/README.md) |
| Desktop pages, layout, panels | [web/README.md](web/README.md) |
| API routes of the desktop app | [web/app/api/README.md](web/app/api/README.md) |
| Themes, Easy and Classic | [web/styles/README.md](web/styles/README.md) |
| The student web app | [student/README.md](student/README.md) |

Lists that come straight from the code (always current): [panels](docs/ai/generated/panels.md), [API routes](docs/ai/generated/api-routes.md), [copilot workflows](docs/ai/generated/copilot-workflows.md), [bridge](docs/ai/generated/bridge.md), [environment variables](docs/ai/generated/env-vars.md), [commands and pipelines](docs/ai/generated/commands-and-pipelines.md), [modules](docs/ai/generated/modules.md).

For a person, the long form of all this is the Developer Guide (a Word file, `Study-Planner-System-Developer-Guide.docx`, kept next to the repository).

## Keeping the docs true

- A document states a rule and names the file or test that enforces it. It does not copy code or line numbers.
- When you add a panel, route, workflow, bridge function or variable, run `npm run docs:facts`.
- When you add a folder under `core/services`, add a `README.md` in it. `npm run docs:check` fails if you do not.
