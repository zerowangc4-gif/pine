import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ChatSendInput } from "@shared/types";
import type { PineService } from "../services/pine-service";

export function registerChatIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.chatSend, async (_event, input: ChatSendInput): Promise<void> => {
    await service.sendChatMessage(input.text, input.images, input.streamingBehavior);
  });

  ipcMain.handle(IPC_CHANNELS.chatAbort, (): Promise<void> => service.abortChat());
}
