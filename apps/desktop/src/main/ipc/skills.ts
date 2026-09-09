import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { FileResult, SkillInfo } from "@shared/types";
import type { PineService } from "../services/pine-service";

export function registerSkillsIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.skillsList, (): SkillInfo[] => service.listSkills());

  ipcMain.handle(
    IPC_CHANNELS.skillsCreate,
    (_event, name: string, description: string): Promise<FileResult> =>
      service.createSkill(name, description),
  );
}
