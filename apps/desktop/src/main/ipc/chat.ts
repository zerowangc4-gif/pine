import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ChatSendInput } from "@shared/types";
import type { PineService } from "../services/pine-service";

export function registerChatIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.chatSend, (_event, input: ChatSendInput): void => {
    // Fire-and-forget: an agent run can last minutes and must not keep the IPC
    // promise pending. All state flows back through the chat event stream, so
    // cancelling the renderer saga never strands a running handler.
    void service.sendChatMessage(input.text, input.images, input.streamingBehavior).catch(() => {
      // Errors are already forwarded to the renderer via the `error` event.
    });
  });

  ipcMain.handle(IPC_CHANNELS.chatAbort, (): Promise<void> => service.abortChat());
}
