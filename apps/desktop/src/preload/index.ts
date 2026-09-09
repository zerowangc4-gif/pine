import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  ActiveModelInfo,
  ChatEvent,
  ChatImage,
  ChatSendInput,
  ConnectInput,
  ConnectResult,
  DirEntry,
  FileResult,
  Pi,
  ProviderInfo,
  SessionListResult,
  SessionMessage,
  SessionSettingsDTO,
  SessionStatsDTO,
  SkillInfo,
  ThinkingLevel,
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
  renameEntry: (path: string, name: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesRename, path, name),
  deleteEntry: (path: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesDelete, path),
  revealInExplorer: (path: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.filesReveal, path),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.filesReadFile, filePath),
  onFilesChanged: (callback: () => void): void => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.filesChanged);
    ipcRenderer.on(IPC_CHANNELS.filesChanged, () => callback());
  },
  writeFile: (filePath: string, content: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesWriteFile, filePath, content),

  listSkills: (): Promise<SkillInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.skillsList),
  createSkill: (name: string, description: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.skillsCreate, name, description),

  listSessions: (): Promise<SessionListResult> => ipcRenderer.invoke(IPC_CHANNELS.sessionsList),
  loadSession: (path: string): Promise<SessionMessage[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsLoad, path),
  deleteSession: (path: string): Promise<FileResult> => ipcRenderer.invoke(IPC_CHANNELS.sessionsDelete, path),
  newSession: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.sessionsNew),
  renameSession: (name: string): Promise<FileResult> => ipcRenderer.invoke(IPC_CHANNELS.sessionsRename, name),
  getSessionStats: (): Promise<SessionStatsDTO> => ipcRenderer.invoke(IPC_CHANNELS.sessionsStats),
  getSessionSettings: (): Promise<SessionSettingsDTO> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsSettings),
  setAutoCompaction: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsSetAutoCompaction, enabled),

  switchModel: (provider: string, model: string): Promise<ConnectResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.modelSwitch, provider, model),
  setThinkingLevel: (level: ThinkingLevel): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.modelThinkingLevel, level),
  getActiveModel: (): Promise<ActiveModelInfo> => ipcRenderer.invoke(IPC_CHANNELS.modelActive),
  getActiveTools: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.modelActiveTools),
  setActiveTools: (tools: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.modelSetActiveTools, tools),

  copyText: (text: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.systemCopyText, text),
  readClipboardImage: (): Promise<ChatImage | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.systemReadClipboardImage),

  sendMessage: (input: ChatSendInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.chatSend, input),
  abort: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.chatAbort),
  onChatEvent: (callback: (event: ChatEvent) => void): void => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.chatEvent);
    ipcRenderer.on(IPC_CHANNELS.chatEvent, (_event, payload: ChatEvent) => callback(payload));
  },
};

contextBridge.exposeInMainWorld("pi", pi);
