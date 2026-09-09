import { type BrowserWindow } from "electron";
export function sendMessage(win: BrowserWindow) {
  win.webContents.send("load-config", "配置已经加载完成");
}
