import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("native", {
  platform: process.platform,
  versions: process.versions
});

contextBridge.exposeInMainWorld("themeAPI", {
  getSystemTheme: () => ipcRenderer.invoke("get-system-theme"),
  onThemeChange: (callback: (theme: string) => void) => {
    ipcRenderer.on("system-theme-changed", (_, theme) => callback(theme));
  }
});

contextBridge.exposeInMainWorld("portalAPI", {
  clearSession: () => ipcRenderer.invoke("clear-portal-session"),
});

contextBridge.exposeInMainWorld("dbAPI", {
  isReady: () => ipcRenderer.invoke("is-db-ready"),
  onReady: (cb: () => void) => ipcRenderer.once("db-ready", cb),
});

contextBridge.exposeInMainWorld("updaterAPI", {
  onStatus: (callback: (payload: Record<string, unknown>) => void) => {
    ipcRenderer.on("updater-status", (_, payload) => callback(payload));
  },
  check:    () => ipcRenderer.invoke("updater-check"),
  download: () => ipcRenderer.invoke("updater-download"),
  install:  () => ipcRenderer.invoke("updater-install"),
});

contextBridge.exposeInMainWorld("shutdownAPI", {
  onShuttingDown: (cb: () => void) =>
    ipcRenderer.on("app-shutting-down", () => cb()),
  onProgress: (cb: (data: { service: string; done: boolean }) => void) =>
    ipcRenderer.on("shutdown-progress", (_, data) => cb(data)),
});

contextBridge.exposeInMainWorld('auditAPI', {
  generatePDF: (args: { sessionId: string }) =>
    ipcRenderer.invoke('print-graduation-audit', args),
});
