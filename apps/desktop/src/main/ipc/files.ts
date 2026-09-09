import { watch, promises as fs, type FSWatcher } from "node:fs";
import path from "node:path";
import { dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { AppError } from "@shared/errors";
import { IPC_CHANNELS } from "@shared/ipc";
import type { DirEntry, FileResult } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { PineService } from "../services/pine-service";

type EntryKind = "file" | "folder";

let fileWatcher: FSWatcher | undefined;
let fileWatcherTimer: NodeJS.Timeout | undefined;

function sendFilesChanged(getWindow: () => BrowserWindow | undefined): void {
  const window = getWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.filesChanged);
  }
}

/**
 * Auto-refresh the explorer when files change on disk, the same way VSCode does.
 * Debounced so bursts of writes (e.g. an agent editing several files) collapse
 * into a single refresh.
 */
function watchWorkspace(root: string, getWindow: () => BrowserWindow | undefined): void {
  fileWatcher?.close();
  fileWatcher = undefined;
  if (fileWatcherTimer) {
    clearTimeout(fileWatcherTimer);
    fileWatcherTimer = undefined;
  }

  try {
    fileWatcher = watch(root, { recursive: true }, () => {
      if (fileWatcherTimer) {
        clearTimeout(fileWatcherTimer);
      }
      fileWatcherTimer = setTimeout(() => {
        fileWatcherTimer = undefined;
        sendFilesChanged(getWindow);
      }, 300);
    });
    fileWatcher.on("error", () => {
      // A disappearing watch (e.g. deleted root) is safe to ignore.
    });
  } catch {
    // Recursive watching is unavailable on some platforms; the explorer stays
    // correct via explicit file operations.
  }
}

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
    const target = resolveWithinRoot(service.getWorkspaceRoot(), path.join(dir, trimmed));
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
    watchWorkspace(root, getWindow);
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

  ipcMain.handle(
    IPC_CHANNELS.filesRename,
    async (_event, target: string, name: string): Promise<FileResult> => {
      try {
        const root = service.getWorkspaceRoot();
        const resolved = resolveWithinRoot(root, target);
        if (resolved === path.resolve(root ?? "")) {
          return { ok: false, error: AppError.operationFailed };
        }
        const trimmed = name.trim();
        if (!trimmed) {
          return { ok: false, error: AppError.nameRequired };
        }
        const nextPath = resolveWithinRoot(root, path.join(path.dirname(resolved), trimmed));
        if (nextPath === resolved) {
          return { ok: true, path: resolved };
        }
        if (await pathExists(nextPath)) {
          return { ok: false, error: AppError.nameExists };
        }
        await fs.rename(resolved, nextPath);
        return { ok: true, path: nextPath };
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.filesDelete, async (_event, target: string): Promise<FileResult> => {
    try {
      const root = service.getWorkspaceRoot();
      const resolved = resolveWithinRoot(root, target);
      if (resolved === path.resolve(root ?? "")) {
        return { ok: false, error: AppError.cannotDeleteRoot };
      }
      await fs.rm(resolved, { recursive: true, force: true });
      return { ok: true, path: resolved };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.filesReveal, (_event, target: string): void => {
    const resolved = resolveWithinRoot(service.getWorkspaceRoot(), target);
    shell.showItemInFolder(resolved);
  });
}
