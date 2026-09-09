import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  ChatEvent,
  ConnectInput,
  ConnectResult,
  DirEntry,
  FileResult,
  Pi,
  ProviderInfo,
} from "@shared/types";

const pi: Pi = {
  listProviders: (): Promise<ProviderInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.providersList),
  connect: (input: ConnectInput): Promise<ConnectResult> => ipcRenderer.invoke(IPC_CHANNELS.connect, input),

  openFolder: (title: string): Promise<string | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesOpenFolder, title),
  readDir: (dirPath: string): Promise<DirEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesReadDir, dirPath),
  createFile: (dirPath: string, name: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesCreateFile, dirPath, name),
  createFolder: (dirPath: string, name: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesCreateFolder, dirPath, name),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.filesReadFile, filePath),
  writeFile: (filePath: string, content: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesWriteFile, filePath, content),

  sendMessage: (text: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.chatSend, text),
  abort: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.chatAbort),
  onChatEvent: (callback: (event: ChatEvent) => void): void => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.chatEvent);
    ipcRenderer.on(IPC_CHANNELS.chatEvent, (_event, payload: ChatEvent) => callback(payload));
  },
};

contextBridge.exposeInMainWorld("pi", pi);
