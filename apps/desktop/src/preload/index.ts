import { contextBridge, ipcRenderer } from "electron";
import type { Pi } from "@shared";

const pi: Pi = {
  loadConfig: (callback: (value: string) => void) => ipcRenderer.on("load-config", (_event, value) => callback(value)),
};

contextBridge.exposeInMainWorld("pi", pi);
