import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels, type ElectronApi } from "@/shared/ipc";

const electronApi: ElectronApi = {
  onReady: listener => {
    ipcRenderer.on(ipcChannels.ready, (_event, ready: boolean) => {
      listener(ready);
    });
  },
};

contextBridge.exposeInMainWorld("electronApi", electronApi);
