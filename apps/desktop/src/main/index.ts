import path from "node:path";
import { app, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ChatEvent } from "@shared/types";
import { registerIpc } from "./ipc";
import { FileService, PineService } from "./services";

let mainWindow: BrowserWindow | undefined;

const getWindow = (): BrowserWindow | undefined => mainWindow;

/** Must match the renderer dark theme's `bg` (`theme.ts` darkColors.bg) to
 * avoid a white flash before the renderer paints its own background. */
const WINDOW_BACKGROUND = "#0b0e16";

/**
 * Sessions live in the OS user-data directory (Electron convention) so they stay
 * writable in every environment (dev and packaged). Writing to the install
 * directory would fail on read-only paths like `C:\Program Files`.
 */
function getSessionsDir(): string {
  return path.join(app.getPath("userData"), "sessions");
}

function sendToWindow(event: ChatEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.chatEvent, event);
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    title: "Pine",
    backgroundColor: WINDOW_BACKGROUND,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const service = new PineService(sendToWindow, getSessionsDir());
  const fileService = new FileService({
    getWindow,
    getWorkspaceRoot: () => service.getWorkspaceRoot(),
    setWorkspaceRoot: (root) => service.setWorkspaceRoot(root),
  });
  registerIpc(service, fileService);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
