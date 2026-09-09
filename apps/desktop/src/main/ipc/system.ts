import { clipboard, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";

export function registerSystemIpc(): void {
  ipcMain.handle(IPC_CHANNELS.systemCopyText, (_event, text: string): void => {
    clipboard.writeText(text);
  });
}
