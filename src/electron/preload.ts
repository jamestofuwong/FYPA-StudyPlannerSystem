import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("native", {
  platform: process.platform,
  versions: process.versions
});
