# Electron and the user interface: the bridge

Electron version: **41** (`^41.3.0` in `package.json`), with Next.js 16.1.6 and React 19. Electron changes its APIs and security defaults often. Check `package.json` and the [Electron 41 release notes](https://www.electronjs.org/blog/electron-41-0) before you copy code from an older example.

## The three parts

- **Main process** (`electron/main.ts`): Node.js with full access to the computer. It starts the database, Ollama and the Next.js server, and creates the window. ([process model](https://www.electronjs.org/docs/latest/tutorial/process-model))
- **Renderer** (the window): a sandboxed Chromium page that shows the Next.js UI. It has no Node.js. It loads `http://localhost:<port>` from the Next.js server that runs inside the main process.
- **Preload** (`electron/preload.ts`): runs before the page. It uses `contextBridge.exposeInMainWorld` to give the page named functions. ([context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation))

## The pattern

- **Features use HTTP, not IPC.** A page calls `fetch('/api/...')`. The route handler runs in the Next.js server in the main process.
- **Operating-system tasks use IPC through the bridge.** For a request and a reply: `ipcRenderer.invoke` in the preload and `ipcMain.handle` in main. For events: `webContents.send` in main and `ipcRenderer.on` in the preload. ([IPC](https://www.electronjs.org/docs/latest/tutorial/ipc))
- **The preload exposes functions and never `ipcRenderer`.**
- Window flags in `createMainWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: true`. `webviewTag` is on for the portal login (`web/components/layout/PortalLoginModal.tsx`, `core/services/scrapper`). It is the only UI feature that works only in Electron. Electron's documentation recommends other options for new code.
- `tests/unit/electron-ipc-contract.test.ts` fails when the preload and main disagree, when an object other than the six documented ones is exposed, or when a security flag changes.

The exact list of objects, functions and channels is generated from the code: [generated/bridge.md](generated/bridge.md). The page calls bridge objects only with a guard, for example `window.updaterAPI?.download()`. The page must still work when the object is missing.

`get-database-url` is a handler that no preload function uses. Leave it unexposed. The contract test lists it as a known exception.

## Add an operating-system operation

1. Write the handler in `electron/main.ts`: `ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')))`. Check every argument. The page is not trusted.
2. Expose one named function in `electron/preload.ts` that calls `ipcRenderer.invoke` with a fixed channel name. Never take the channel name from the page.
3. Add the type to `Window` in `core/shared/types/global.d.ts`, optional (`?`). Some old calls use `(window as any)`. Do not copy that.
4. Call it with a guard: `window.folderAPI?.open()`.
5. Update `tests/unit/electron-ipc-contract.test.ts` (the list of exposed objects).
6. Restart `npm run dev`. Electron must restart to load a new preload (tsup rebuilds `dist/electron`).
7. Run `npm run docs:facts`.

## Why the UI is easy to move to a web app

- No file in `web/` or `core/` imports `electron` (`npm run docs:check` enforces this).
- Every bridge call is optional. The end-to-end tests (`e2e/`) run the whole UI in plain Chromium, without Electron, and every page loads.
- Features go through HTTP route handlers. The same handlers can run on a web server.
- The student app is already a web app and reuses `core/shared` and `core/services/scheduling`.

## What would change for a web deployment

| Part | Today | On a web server |
|---|---|---|
| Database | Embedded PostgreSQL started by `runtime/postgres` | A hosted PostgreSQL. Set `DATABASE_URL`. Remove the start-up code. |
| Local AI | Ollama on the advisor computer | A hosted model service or an Ollama server. Change `core/config/ollama.ts`. |
| PDF import | A Python script or binary that a route starts | A service or container that the server can call. |
| Portal login and session | Puppeteer and a `globalThis` singleton for one user | One session per user, in a store. Review the PDPA position: a server must not keep student records. |
| Authentication | None. Only the local user reaches the API. | Required for every route before anything is public. |
| Updates, theme, shutdown | The bridge objects | Not needed. Use `prefers-color-scheme` and the host deployment process. |
| Portal login window | The Electron `<webview>` | Not possible in a browser. Use another login method. |

Moving to the web is a project, not a switch. The UI and API code need few changes. The runtime parts in this table need replacements, and the privacy rules need a new review.
