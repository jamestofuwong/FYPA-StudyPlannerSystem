import { app, BrowserWindow, nativeTheme, ipcMain } from "electron";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "http";
import next from "next";
import path from "path";

type NextServerHandle = {
  url: string;
  close: () => Promise<void>;
};

const devServerUrl = process.env.NEXT_DEV_SERVER_URL;

async function startNextServer(): Promise<NextServerHandle> {
  const nextApp = next({
    dev: false,
    dir: app.getAppPath()
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
