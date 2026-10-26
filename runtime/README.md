# runtime: processes that the app starts

Both modules use `electron` (`app.getPath('userData')`, `app.isPackaged`), so a plain script cannot start them. Use `node scripts/db-up.js` to start the database cluster without Electron.

## postgres/db.ts

- `startDatabase()`: starts embedded PostgreSQL (`embedded-postgres`) on `127.0.0.1:5433`, creates the `studyplanner` database if needed, returns `true` on a first run (a new or invalid cluster).
- `runSeedsIfFirstRun(isFirstRun)`: loads the five files in `postgres/scripts/seed/*.sql` once. An existing install never runs them again.
- `stopDatabase()`: stops the cluster. The auto-updater calls it before the installer starts, so Windows does not corrupt the update.
- `getDatabaseUrl()`: builds the URL from the `DB_*` variables with defaults (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). Data folder: `userData/pgdata`.
- A patch in `patches/` fixes the embedded-postgres path on Windows inside an asar package.

## ollama/ollama.ts

- `startOllama()`: starts the bundled Ollama binary from `resources/ollama` (downloaded by `npm run download:ollama`, ignored by Git) on port 11435 (`core/config/ollama.ts`) with models in `userData/ollama-models`. Reuses a server that already runs. It keeps the bundled runtime apart from a user's own Ollama install.
- `stopOllama()`: stops it only when this app started it.

The start-up order is in [docs/ai/architecture.md](../docs/ai/architecture.md). The Ollama start does not block the window.
