import { promises as fs } from "node:fs";
import path from "node:path";
import { dialog, ipcMain, type BrowserWindow } from "electron";
import { AppError } from "@shared/errors";
import { IPC_CHANNELS } from "@shared/ipc";
import type { DirEntry, FileResult } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { PineService } from "../services/pine-service";

type EntryKind = "file" | "folder";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

function resolveWithinRoot(root: string | undefined, target: string): string {
  if (!root) {
    throw new Error(AppError.noFolder);
  }
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  const isWithin = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (!isWithin) {
    throw new Error(AppError.pathOutsideRoot);
  }
  return resolved;
}

async function createEntry(service: PineService, dirPath: string, name: string, kind: EntryKind): Promise<FileResult> {
  try {
    const dir = resolveWithinRoot(service.getWorkspaceRoot(), dirPath);
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, error: AppError.nameRequired };
    }
    const target = path.join(dir, trimmed);
    if (await pathExists(target)) {
      return { ok: false, error: AppError.nameExists };
    }
    if (kind === "file") {
      await fs.writeFile(target, "", "utf8");
    } else {
      await fs.mkdir(target);
    }
    return { ok: true, path: target };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export function registerFilesIpc(
  service: PineService,
  getWindow: () => BrowserWindow | undefined,
): void {
  ipcMain.handle(IPC_CHANNELS.filesOpenFolder, async (_event, title: string): Promise<string | undefined> => {
    const window = getWindow();
    if (!window) {
      return undefined;
    }
    const result = await dialog.showOpenDialog(window, {
      title,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }
    const root = result.filePaths[0];
    service.setWorkspaceRoot(root);
    return root;
  });

  ipcMain.handle(IPC_CHANNELS.filesReadDir, async (_event, dirPath: string): Promise<DirEntry[]> => {
    const dir = resolveWithinRoot(service.getWorkspaceRoot(), dirPath);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .map((entry) => ({
        name: entry.name,
        path: path.join(dir, entry.name),
        type: entry.isDirectory() ? ("dir" as const) : ("file" as const),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  });

  ipcMain.handle(
    IPC_CHANNELS.filesCreateFile,
    (_event, dirPath: string, name: string): Promise<FileResult> =>
      createEntry(service, dirPath, name, "file"),
  );

  ipcMain.handle(
    IPC_CHANNELS.filesCreateFolder,
    (_event, dirPath: string, name: string): Promise<FileResult> =>
      createEntry(service, dirPath, name, "folder"),
  );

  ipcMain.handle(IPC_CHANNELS.filesReadFile, async (_event, filePath: string): Promise<string> => {
    const resolved = resolveWithinRoot(service.getWorkspaceRoot(), filePath);
    return fs.readFile(resolved, "utf8");
  });

  ipcMain.handle(
    IPC_CHANNELS.filesWriteFile,
    async (_event, filePath: string, content: string): Promise<FileResult> => {
      try {
        const resolved = resolveWithinRoot(service.getWorkspaceRoot(), filePath);
        await fs.writeFile(resolved, content, "utf8");
        return { ok: true, path: resolved };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
  );
}
