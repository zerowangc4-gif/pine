import path from "node:path";
import { app, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ChatEvent } from "@shared/types";
import { registerIpc } from "./ipc";
import { PineService } from "./services/pine-service";

let mainWindow: BrowserWindow | undefined;

const getWindow = (): BrowserWindow | undefined => mainWindow;

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
    backgroundColor: "#0b0e16",
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
  const service = new PineService(sendToWindow);
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
