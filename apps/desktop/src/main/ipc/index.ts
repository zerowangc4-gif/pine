import type { BrowserWindow } from "electron";
import type { FileService, PineService } from "../services";
import { registerProviderIpc } from "./providers";
import { registerChatIpc } from "./chat";
import { registerFilesIpc } from "./files";
import { registerSessionsIpc } from "./sessions";
import { registerSystemIpc } from "./system";

export function registerIpc(
  service: PineService,
  fileService: FileService,
  getWindow: () => BrowserWindow | undefined,
): void {
  registerProviderIpc(service);
  registerChatIpc(service);
  registerFilesIpc(fileService);
  registerSessionsIpc(service, getWindow);
  registerSystemIpc();
}
