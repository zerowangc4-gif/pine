import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  FileResult,
  SessionListResult,
  SessionMessage,
  SessionSettingsDTO,
  SessionStatsDTO,
} from "@shared/types";
import type { PineService } from "../services/pine-service";

export function registerSessionsIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.sessionsList, (): Promise<SessionListResult> => service.listSessions());

  ipcMain.handle(
    IPC_CHANNELS.sessionsLoad,
    (_event, path: string): Promise<SessionMessage[]> => service.loadSession(path),
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionsDelete,
    (_event, path: string): Promise<FileResult> => service.deleteSession(path),
  );

  ipcMain.handle(IPC_CHANNELS.sessionsNew, (): Promise<void> => service.newSession());

  ipcMain.handle(
    IPC_CHANNELS.sessionsRename,
    (_event, name: string): Promise<FileResult> => service.renameSession(name),
  );

  ipcMain.handle(IPC_CHANNELS.sessionsStats, (): SessionStatsDTO => service.getSessionStats());

  ipcMain.handle(IPC_CHANNELS.sessionsSettings, (): SessionSettingsDTO => service.getSessionSettings());

  ipcMain.handle(
    IPC_CHANNELS.sessionsSetAutoCompaction,
    (_event, enabled: boolean): Promise<void> => service.setAutoCompaction(enabled),
  );
}
