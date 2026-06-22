import { app, BrowserWindow, nativeTheme, ipcMain, session } from "electron";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "http";
import fs from "fs";
import next from "next";
import path from "path";
import { autoUpdater } from "electron-updater";
import { startDatabase, stopDatabase, getDatabaseUrl } from '../runtime/postgres/db'
import { startOllama, stopOllama } from '../runtime/ollama/ollama'

let nextServerRef: NextServerHandle | undefined
let dbReady = false;

type NextServerHandle = {
  url: string;
  close: () => Promise<void>;
};

const devServerUrl = process.env.NEXT_DEV_SERVER_URL;

// ── File logger (writes to userData/logs/main.log) ───────────────────────────
let logStream: fs.WriteStream | null = null;

function initLogger() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logStream = fs.createWriteStream(path.join(logsDir, 'main.log'), { flags: 'w' });
  const write = (level: string, args: unknown[]) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(String).join(' ')}\n`;
    logStream?.write(line);
    process.stdout.write(line);
  };
  console.log   = (...a) => write('INFO',  a);
  console.warn  = (...a) => write('WARN',  a);
  console.error = (...a) => write('ERROR', a);
}

app.whenReady().then(initLogger);

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

// Suppress noisy warnings from Next.js about missing "done" callback in API routes (library issue)
process.on('unhandledRejection', (reason) => {
  if (reason instanceof TypeError && reason.message === 'done is not a function') {
    return
  }
  console.error('[App] Unhandled rejection:', reason)
})

function getNextProjectDir(): string {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "app", "web"),
        path.join(process.resourcesPath, "app", "app"),
        path.join(process.resourcesPath, "app.asar.unpacked", "web"),
        path.join(process.resourcesPath, "app.asar.unpacked", "app")
      ]
    : [
        path.resolve(__dirname, "..", "..", "web"),
        path.resolve(__dirname, "..", "..", "app"),
        path.join(app.getAppPath(), "web"),
        path.join(app.getAppPath(), "app"),
        path.join(process.cwd(), "web"),
        path.join(process.cwd(), "app")
      ];

  const match = candidates.find((dir) => isDirectory(dir) && isDirectory(path.join(dir, "app")));
  if (match) return match;

  return candidates[0];
}

async function startNextServer(): Promise<NextServerHandle> {
  const nextApp = next({
    dev: false,
    dir: getNextProjectDir()
  });

  await nextApp.prepare();

  const handle = nextApp.getRequestHandler();
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) =>
    handle(req, res)
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "localhost", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://localhost:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
}

async function createMainWindow() {

  const preloadPath = path.join(app.getAppPath(), "dist/electron/preload.js");

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (devServerUrl) {
    await win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    nextServerRef = await startNextServer()
    console.log('[Next.js] Server started at:', nextServerRef.url);
    await win.loadURL(nextServerRef.url);
  }

  // app.on("before-quit", () => {
  //   void nextServer?.close();
  // });
}

ipcMain.handle("get-system-theme", () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});

ipcMain.handle("clear-portal-session", async () => {
  const ses = session.fromPartition("persist:sisportal-advisor");
  await ses.clearStorageData();
  await ses.clearCache();
});

ipcMain.handle("get-database-url", () => {
  return getDatabaseUrl();
});

ipcMain.handle("is-db-ready", () => dbReady);

// ── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  // Only run in packaged production builds
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus("checking");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus("available", { version: info.version, releaseNotes: info.releaseNotes });
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus("not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("downloading", { percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus("downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
    sendUpdateStatus("error", { message: err.message });
  });

  // Check for updates 5 seconds after startup, then every 4 hours
  setTimeout(() => { autoUpdater.checkForUpdates().catch(console.error); }, 5_000);
  setInterval(() => { autoUpdater.checkForUpdates().catch(console.error); }, 4 * 60 * 60 * 1_000);
}

function sendUpdateStatus(status: string, data?: Record<string, unknown>) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("updater-status", { status, ...data });
  });
}

// IPC: renderer asks to check for updates
ipcMain.handle("updater-check", () => {
  autoUpdater.checkForUpdates().catch(console.error);
});

// IPC: renderer asks to start downloading
ipcMain.handle("updater-download", () => {
  autoUpdater.downloadUpdate().catch(console.error);
});

// IPC: renderer asks to quit and install
// Stop the database BEFORE spawning the NSIS installer. On Windows,
// electron-updater spawns the installer as a detached process immediately,
// which races with our before-quit shutdown. If postgres is still running when
// NSIS tries to overwrite its binaries, Windows file-locks cause a silent
// partial update that leaves the binary directory corrupted.
ipcMain.handle("updater-install", async () => {
  // Set isQuitting so the before-quit handler (fired by quitAndInstall internally)
  // skips its shutdown sequence — we handle it here in the correct order.
  isQuitting = true;
  try {
    // Close Next.js first so Prisma releases its connection pool, then stop
    // postgres and Ollama. Running them in parallel would cause pg_ctl stop
    // (smart mode) to hang waiting for open connections.
    await (nextServerRef?.close() ?? Promise.resolve()).catch(console.warn);
    await Promise.allSettled([stopDatabase(), stopOllama()]);
  } catch (err) {
    console.warn('[Updater] Pre-install shutdown warning:', err);
  }
  autoUpdater.quitAndInstall();
});

nativeTheme.on("updated", () => {
  const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";

  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("system-theme-changed", theme);
  });
});

app.whenReady().then(async () => {
  // Set DATABASE_URL immediately so Prisma has the connection string
  process.env.DATABASE_URL = getDatabaseUrl();

  // Start Ollama (non-blocking — app opens even if Ollama isn't ready yet)
  startOllama().catch((err) => console.error('[Ollama] Startup error:', err));

  // Auto-updater (production only)
  setupAutoUpdater();

  // Open window immediately — don't block on DB init
  const dbPromise = startDatabase()
    .then(() => {
      dbReady = true;
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('db-ready'));
    })
    .catch((err) => console.error('[DB] Startup failed:', err));

  const [, windowResult] = await Promise.allSettled([
    dbPromise,
    createMainWindow(),
  ]);

  if (windowResult.status === 'rejected') {
    console.error('[App] Failed to create main window:', windowResult.reason);
  }
});

let isQuitting = false;

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  
  event.preventDefault();
  isQuitting = true;


  // 15 s on Windows (postgres stop can be slow); 5 s on other platforms.
  const shutdownTimeout = process.platform === 'win32' ? 15_000 : 5_000;
  const forceExit = setTimeout(() => {
    console.warn('[App] Shutdown timed out, forcing exit');
    app.exit(1);
  }, shutdownTimeout);

  try {
    // Close Next.js first so Prisma releases DB connections before pg stops.
    // pg_ctl stop (smart mode) waits for active connections — if Prisma's pool
    // is still open, it hangs until the 5-second timeout force-kills the app,
    // leaving postgres running and its binaries locked on Windows.
    await (nextServerRef?.close() ?? Promise.resolve()).catch(console.warn);
    await Promise.allSettled([
      stopDatabase(),
      stopOllama(),
    ]);
    clearTimeout(forceExit);
    app.exit(0);
  } catch (err) {
    console.error('[App] Shutdown error:', err);
    clearTimeout(forceExit);
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});
