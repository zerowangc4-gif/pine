import type { BrowserWindow } from "electron";
import type { PineService } from "../services/pine-service";
import { registerProviderIpc } from "./providers";
import { registerChatIpc } from "./chat";
import { registerFilesIpc } from "./files";

export function registerIpc(service: PineService, getWindow: () => BrowserWindow | undefined): void {
  registerProviderIpc(service);
  registerChatIpc(service);
  registerFilesIpc(service, getWindow);
}
