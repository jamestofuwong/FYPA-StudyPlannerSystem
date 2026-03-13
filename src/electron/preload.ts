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
