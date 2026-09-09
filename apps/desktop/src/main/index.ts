import path from "node:path";
import { app, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ChatEvent } from "@shared/types";
import { registerIpc } from "./ipc";
import { PineService } from "./services/pine-service";

let mainWindow: BrowserWindow | undefined;

const getWindow = (): BrowserWindow | undefined => mainWindow;

/** Must match the renderer dark theme's `bg` (`theme.ts` darkColors.bg) to
 * avoid a white flash before the renderer paints its own background. */
const WINDOW_BACKGROUND = "#0b0e16";

/**
 * Sessions live next to the app itself ("install dir/sessions") instead of in
 * the user's home directory, so every conversation travels with the app folder.
 * In development `app.getAppPath()` is the project root; when packaged we fall
 * back to the directory containing the executable, which stays writable.
 */
function getSessionsDir(): string {
  const baseDir = app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
  return path.join(baseDir, "sessions");
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
  registerIpc(service, getWindow);
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
