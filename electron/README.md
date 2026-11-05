# electron: main process and preload

Two files. They are compiled by tsup (`npm run build:electron`) into `dist/electron`.

## main.ts

`app.whenReady` sets `DATABASE_URL` and `APP_DATA_DIR`, starts Ollama (not awaited), sets up the auto-updater (packaged builds), then starts the database and creates the window in parallel. It also:

- starts Next.js with `startNextServer` (`next({ dev: false })` in an HTTP server on a random local port), or loads `NEXT_DEV_SERVER_URL` in development;
- runs `prisma migrate deploy` (and `prisma generate` in development) with `fork`;
- registers the IPC handlers (`ipcMain.handle`) and the updater events;
- writes the log to `userData/logs/main.log`;
- stops all services on `before-quit` (force exit after 5 s, 15 s on Windows).

## preload.ts

Exposes `native`, `themeAPI`, `portalAPI`, `dbAPI`, `updaterAPI` and `shutdownAPI` with `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer`. The full table is generated: [bridge](../docs/ai/generated/bridge.md). The rules and the steps to add an operation: [electron-bridge.md](../docs/ai/electron-bridge.md).

## Rules

- Window flags: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Do not weaken them. A test checks them.
- Electron is version 41. Check its release notes before you use an API from older examples.
- Nothing in `web/` or `core/` may import `electron`.
- A change here needs a restart of `npm run dev`.

Tests: `tests/unit/electron-ipc-contract.test.ts` (the source files only). The packaged app (window, updates, first start) has no automated test. Test a packaged build by hand (`npm run pack`).
