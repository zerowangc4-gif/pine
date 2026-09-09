import { clipboard, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ChatImage } from "@shared/types";

export function registerSystemIpc(): void {
  ipcMain.handle(IPC_CHANNELS.systemCopyText, (_event, text: string): void => {
    clipboard.writeText(text);
  });

  ipcMain.handle(IPC_CHANNELS.systemReadClipboardImage, (): ChatImage | undefined => {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return undefined;
    }
    const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(image.toDataURL());
    return match ? { mimeType: match[1], data: match[2] } : undefined;
  });
}
