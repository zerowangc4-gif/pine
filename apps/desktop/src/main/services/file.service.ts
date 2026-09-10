import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { dialog, shell, type BrowserWindow } from "electron";
import { AppError } from "@shared/errors";
import { IPC_CHANNELS } from "@shared/ipc";
import type { FileRequest, FileResponse, FileResult } from "@shared/types";
import { toErrorMessage } from "@shared/utils";

type EntryKind = "file" | "folder";

/**
 * The workspace folder is owned by PineService (chat sessions are scoped to
 * the same root). FileService only reads/writes it through these callbacks so
 * the two stay in sync without FileService knowing about PineService.
 */
interface FileServiceDeps {
  getWindow: () => BrowserWindow | undefined;
  getWorkspaceRoot: () => string | undefined;
  setWorkspaceRoot: (root: string) => void;
}

/**
 * Every filesystem operation the renderer can ask for, dispatched by intent.
 *
 * The renderer sends a {@link FileRequest} (an `intent` + the parameters that
 * intent needs) and receives a matching {@link FileResponse}. All disk I/O is
 * asynchronous (`node:fs/promises`), so nothing here blocks the main process.
 */
export class FileService {
  private watcher?: FSWatcher;
  private watcherTimer?: NodeJS.Timeout;

  constructor(private readonly deps: FileServiceDeps) {}

  async execute(request: FileRequest): Promise<FileResponse> {
    switch (request.intent) {
      case "openFolder":
        return this.openFolder(request.title);
      case "readDir":
        return this.readDir(request.path);
      case "createFile":
        return this.createEntry(request.dirPath, request.name, "file");
      case "createFolder":
        return this.createEntry(request.dirPath, request.name, "folder");
      case "readFile":
        return this.readFile(request.path);
      case "writeFile":
        return this.writeFile(request.path, request.content);
      case "rename":
        return this.rename(request.path, request.name);
      case "delete":
        return this.delete(request.path);
      case "reveal":
        return this.reveal(request.path);
    }
  }

  // ── workspace folder ─────────────────────────────────────────────────

  private async openFolder(title: string): Promise<FileResponse> {
    const window = this.deps.getWindow();
    if (!window) {
      return { intent: "openFolder", path: undefined };
    }

    const result = await dialog.showOpenDialog(window, {
      title,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { intent: "openFolder", path: undefined };
    }

    const root = result.filePaths[0];
    this.deps.setWorkspaceRoot(root);
    this.watchWorkspace(root);
    return { intent: "openFolder", path: root };
  }

  // ── reads ────────────────────────────────────────────────────────────

  private async readDir(dirPath: string): Promise<FileResponse> {
    const dir = this.resolveWithinRoot(dirPath);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return {
      intent: "readDir",
      entries: entries
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
        }),
    };
  }

  private async readFile(filePath: string): Promise<FileResponse> {
    const resolved = this.resolveWithinRoot(filePath);
    const content = await fs.readFile(resolved, "utf8");
    return { intent: "readFile", content };
  }

  // ── writes & mutations ───────────────────────────────────────────────

  private async createEntry(dirPath: string, name: string, kind: EntryKind): Promise<FileResponse> {
    const result = await this.runCreateEntry(dirPath, name, kind);
    return kind === "file"
      ? { intent: "createFile", result }
      : { intent: "createFolder", result };
  }

  private async runCreateEntry(dirPath: string, name: string, kind: EntryKind): Promise<FileResult> {
    try {
      const dir = this.resolveWithinRoot(dirPath);
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, error: AppError.nameRequired };
      }

      const target = this.resolveWithinRoot(path.join(dir, trimmed));
      if (await this.pathExists(target)) {
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

  private async writeFile(filePath: string, content: string): Promise<FileResponse> {
    try {
      const resolved = this.resolveWithinRoot(filePath);
      await fs.writeFile(resolved, content, "utf8");
      return { intent: "writeFile", result: { ok: true, path: resolved } };
    } catch (error) {
      return { intent: "writeFile", result: { ok: false, error: toErrorMessage(error) } };
    }
  }

  private async rename(target: string, name: string): Promise<FileResponse> {
    try {
      const resolved = this.resolveWithinRoot(target);
      if (resolved === path.resolve(this.deps.getWorkspaceRoot() ?? "")) {
        return { intent: "rename", result: { ok: false, error: AppError.operationFailed } };
      }

      const trimmed = name.trim();
      if (!trimmed) {
        return { intent: "rename", result: { ok: false, error: AppError.nameRequired } };
      }

      const nextPath = this.resolveWithinRoot(path.join(path.dirname(resolved), trimmed));
      if (nextPath === resolved) {
        return { intent: "rename", result: { ok: true, path: resolved } };
      }
      if (await this.pathExists(nextPath)) {
        return { intent: "rename", result: { ok: false, error: AppError.nameExists } };
      }

      await fs.rename(resolved, nextPath);
      return { intent: "rename", result: { ok: true, path: nextPath } };
    } catch (error) {
      return { intent: "rename", result: { ok: false, error: toErrorMessage(error) } };
    }
  }

  private async delete(target: string): Promise<FileResponse> {
    try {
      const resolved = this.resolveWithinRoot(target);
      if (resolved === path.resolve(this.deps.getWorkspaceRoot() ?? "")) {
        return { intent: "delete", result: { ok: false, error: AppError.cannotDeleteRoot } };
      }

      await fs.rm(resolved, { recursive: true, force: true });
      return { intent: "delete", result: { ok: true, path: resolved } };
    } catch (error) {
      return { intent: "delete", result: { ok: false, error: toErrorMessage(error) } };
    }
  }

  private reveal(target: string): FileResponse {
    const resolved = this.resolveWithinRoot(target);
    shell.showItemInFolder(resolved);
    return { intent: "reveal" };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.stat(target);
      return true;
    } catch {
      return false;
    }
  }

  private resolveWithinRoot(target: string): string {
    const root = this.deps.getWorkspaceRoot();
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

  // ── workspace watching ───────────────────────────────────────────────

  /**
   * Auto-refresh the explorer when files change on disk, the same way VSCode
   * does. Debounced so bursts of writes (e.g. an agent editing several files)
   * collapse into a single refresh.
   */
  private watchWorkspace(root: string): void {
    this.closeWatcher();
    try {
      this.watcher = watch(root, { recursive: true }, () => {
        if (this.watcherTimer) {
          clearTimeout(this.watcherTimer);
        }
        this.watcherTimer = setTimeout(() => {
          this.watcherTimer = undefined;
          this.sendFilesChanged();
        }, 300);
      });
      this.watcher.on("error", () => {
        // A disappearing watch (e.g. deleted root) is safe to ignore.
      });
    } catch {
      // Recursive watching is unavailable on some platforms; the explorer stays
      // correct via explicit file operations.
    }
  }

  private closeWatcher(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.watcherTimer) {
      clearTimeout(this.watcherTimer);
      this.watcherTimer = undefined;
    }
  }

  private sendFilesChanged(): void {
    const window = this.deps.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.filesChanged);
    }
  }
}
