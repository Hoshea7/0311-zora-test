import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("zora", {
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>
});
