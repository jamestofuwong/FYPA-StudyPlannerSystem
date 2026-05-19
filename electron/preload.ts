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

contextBridge.exposeInMainWorld("updaterAPI", {
  onStatus: (callback: (payload: Record<string, unknown>) => void) => {
    ipcRenderer.on("updater-status", (_, payload) => callback(payload));
  },
  download: () => ipcRenderer.invoke("updater-download"),
  install:  () => ipcRenderer.invoke("updater-install"),
});
