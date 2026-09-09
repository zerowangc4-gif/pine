import type { BrowserWindow } from "electron";
import type { PineService } from "../services/pine-service";
import { registerProviderIpc } from "./providers";
import { registerChatIpc } from "./chat";
import { registerFilesIpc } from "./files";
import { registerSessionsIpc } from "./sessions";
import { registerSkillsIpc } from "./skills";
import { registerSystemIpc } from "./system";

export function registerIpc(service: PineService, getWindow: () => BrowserWindow | undefined): void {
  registerProviderIpc(service);
  registerChatIpc(service);
  registerFilesIpc(service, getWindow);
  registerSessionsIpc(service);
  registerSkillsIpc(service);
  registerSystemIpc();
}
