import { promises as fs } from "node:fs";
import { dialog, ipcMain, type BrowserWindow } from "electron";
import { AppError } from "@shared/errors";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  FileResult,
  SessionListResult,
  SessionMessage,
  SessionSettingsDTO,
  SessionStatsDTO,
} from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { PineService } from "../services";

export function registerSessionsIpc(
  service: PineService,
  getWindow: () => BrowserWindow | undefined,
): void {
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

  ipcMain.handle(
    IPC_CHANNELS.sessionsExport,
    async (_event, title: string): Promise<FileResult> => {
      try {
        const sourcePath = service.getActiveSessionPath();
        if (!sourcePath) {
          return { ok: false, error: AppError.noActiveSession };
        }
        const window = getWindow();
        if (!window) {
          return { ok: false, error: AppError.operationFailed };
        }
        const result = await dialog.showSaveDialog(window, {
          title,
          defaultPath: `pine-session-${Date.now()}.jsonl`,
          filters: [{ name: "JSON Lines", extensions: ["jsonl"] }],
        });
        if (result.canceled || !result.filePath) {
          return { ok: false, error: AppError.operationFailed };
        }
        await fs.copyFile(sourcePath, result.filePath);
        return { ok: true, path: result.filePath };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.sessionsStats, (): SessionStatsDTO => service.getSessionStats());

  ipcMain.handle(IPC_CHANNELS.sessionsSettings, (): SessionSettingsDTO => service.getSessionSettings());

  ipcMain.handle(
    IPC_CHANNELS.sessionsSetAutoCompaction,
    (_event, enabled: boolean): Promise<void> => service.setAutoCompaction(enabled),
  );
}
