import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { PineService } from "../services/pine-service";

export function registerChatIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.chatSend, async (_event, text: string): Promise<void> => {
    await service.sendChatMessage(text);
  });

  ipcMain.handle(IPC_CHANNELS.chatAbort, (): Promise<void> => service.abortChat());
}
