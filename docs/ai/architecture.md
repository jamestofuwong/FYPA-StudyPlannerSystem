# Architecture

## Style

The desktop app is a modular monolith: one deployable unit with clear layers. It runs on the computer of the advisor. The student app is a separate Next.js app that shares a small part of `core/`.

## Parts at run time (desktop)

| Part | Where | What it does |
|---|---|---|
| Main process | `electron/main.ts` | Starts the other parts, creates the window, handles IPC, runs the auto-updater, writes the log, stops everything. |
| Renderer | the window | Shows the Next.js UI. Sandboxed. No Node.js. |
| Preload | `electron/preload.ts` | Gives the page a few named functions ([electron-bridge.md](electron-bridge.md)). |
| Next.js server | started by the main process | Pages and API routes (`web/`). Listens on `localhost` on a random port. |
| Embedded PostgreSQL | `runtime/postgres/db.ts` | The database. Data in `userData/pgdata`. |
| Ollama | `runtime/ollama/ollama.ts` | The local AI model server. |
| Python extractor | `core/services/plannerImport` | Turns a planner PDF into data. A route starts it. |
| University portal | `core/services/portal` | Puppeteer login and REST calls for student data. |

Start-up (`app.whenReady` in `electron/main.ts`): the file logger starts; `DATABASE_URL` and `APP_DATA_DIR` are set in `process.env`; Ollama starts without waiting (the app opens even if it is not ready); the auto-updater is set up (packaged builds only); then the database and the window start together. The database path is: start the cluster, `prisma migrate deploy`, `prisma generate` (development only), run the seed files only on a first run, then send `db-ready` to the window. The window opens before the database is ready. The layout waits for `dbAPI.isReady()` or the `db-ready` event. If a migration fails, the main process logs it and goes on. Check `userData/logs/main.log` first when the app shows no data.

Shutdown (`before-quit`): the main process stops the services. It forces an exit after 5 seconds, or 15 seconds on Windows because stopping PostgreSQL can be slow.

## Layers

```
page (web/app/(pages))  ->  API route (web/app/api)  ->  service (core/services)  ->  repository (core/db/repositories)  ->  Prisma
                                          core/shared: types, constants, pure functions (any layer may import it)
```

- A layer calls only the layer below it. A page never queries the database. A repository never calls a service.
- Services take their data as arguments and return a result. The route or the repository loads the data. This keeps services pure and easy to test.
- `core/shared` must not read files, call the network or use the database.
- The student app imports only `core/shared` and `core/services/scheduling`.

`npm run docs:check` checks the import rules.

## Main flows

**Look up a student and read the match.** The portal session (cookies and an anti-forgery token) comes from a Puppeteer login. `portalSessionService` keeps it in a `globalThis` singleton and saves it in `APP_DATA_DIR`. The student is held in `StudentSessionContext` in the browser. Nothing about the student goes to the database. `/api/match` calls `runDashboardMatch`, which loads the planners and then calls the pure `runMatchingPipeline` ([matching](../../core/services/matching/README.md)).

**Import a study planner PDF.** `plannerImportService.ts` writes the PDF to a temp folder and spawns Python. The Python pipeline extracts the structure and applies quality-gated fallbacks. The result has a `report` with findings. The page shows them so the advisor can correct the planner before saving ([plannerImport](../../core/services/plannerImport/README.md)).

**Ask the AI Copilot.** `/api/copilot/chat` calls `routeAndExtract`, which filters workflows by keywords, asks the model for one workflow id, and reads the parameters with regular expressions. Code runs the workflow. The model only phrases the answer ([copilot](../../core/services/copilot/README.md)).

**Build a pathway.** `POST /api/custom-planner` loads a planner and calls `startPlanForPlanner` and `finishPlanForPlanner`. The student app calls the same functions from `student/lib/generate-plan.ts`, so both apps give the same plan ([scheduling](../../core/services/scheduling/README.md)).

## Decisions that shape the code

| Decision | Reason | Effect |
|---|---|---|
| No student records in the database | PDPA 2010 and university policy | Student data lives in memory. |
| Everything runs on the advisor computer | No server to run. No student data on a network. | Embedded PostgreSQL, local Ollama, local Python. |
| Rule-based matching, not machine learning | An advisor must be able to explain a result. | Weighted scores, readable in `scoringEngine.ts`. |
| Small local model with workflows | A 3B model is weak at free tool use and good at choosing from a short list. | The model routes and phrases. Code computes the facts. |
| One shared `core/` for two apps | The advisor and the student must see the same plan. | The `@core` alias. `core/shared` stays pure. |
| Two Prisma versions | The student app was built later, on Prisma 7. | Upgrade them separately. The two schemas are not linked. |

## Lists from the code

[panels](generated/panels.md), [API routes](generated/api-routes.md), [modules](generated/modules.md).
