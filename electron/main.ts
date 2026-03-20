import { app, BrowserWindow, nativeTheme, ipcMain } from "electron";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "http";
import fs from "fs";
import next from "next";
import path from "path";

type NextServerHandle = {
  url: string;
  close: () => Promise<void>;
};

const devServerUrl = process.env.NEXT_DEV_SERVER_URL;

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function getNextProjectDir(): string {
  const candidates = app.isPackaged
    ? [
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
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
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
  let nextServer: NextServerHandle | undefined;

  const preloadPath = path.join(app.getAppPath(), "dist/electron/preload.js");

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (devServerUrl) {
    await win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    nextServer = await startNextServer();
    await win.loadURL(nextServer.url);
  }

  app.on("before-quit", () => {
    void nextServer?.close();
  });
}

ipcMain.handle("get-system-theme", () => {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
});

nativeTheme.on("updated", () => {
  const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";

  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("system-theme-changed", theme);
  });
});

app.whenReady().then(() => createMainWindow());

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
