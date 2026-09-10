import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { FileRequest, FileResponse } from "@shared/types";
import type { FileService } from "../services";

/**
 * Thin IPC shell for file operations. The renderer picks the operation via the
 * request's `intent`; all filesystem work happens in FileService.
 */
export function registerFilesIpc(fileService: FileService): void {
  ipcMain.handle(
    IPC_CHANNELS.filesExecute,
    (_event, request: FileRequest): Promise<FileResponse> => fileService.execute(request),
  );
}
