import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  ActiveModelInfo,
  ChatEvent,
  ChatImage,
  ChatSendInput,
  ConnectInput,
  ConnectResult,
  FileRequest,
  FileResponse,
  FileResult,
  Pi,
  ProviderInfo,
  SessionListResult,
  SessionMessage,
  SessionSettingsDTO,
  SessionStatsDTO,
  ThinkingLevel,
} from "@shared/types";

const pi: Pi = {
  listProviders: (): Promise<ProviderInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.providersList),
  connect: (input: ConnectInput): Promise<ConnectResult> => ipcRenderer.invoke(IPC_CHANNELS.connect, input),

  executeFile: (request: FileRequest): Promise<FileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.filesExecute, request),
  onFilesChanged: (callback: () => void): void => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.filesChanged);
    ipcRenderer.on(IPC_CHANNELS.filesChanged, () => callback());
  },

  listSessions: (): Promise<SessionListResult> => ipcRenderer.invoke(IPC_CHANNELS.sessionsList),
  loadSession: (path: string): Promise<SessionMessage[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsLoad, path),
  deleteSession: (path: string): Promise<FileResult> => ipcRenderer.invoke(IPC_CHANNELS.sessionsDelete, path),
  newSession: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.sessionsNew),
  renameSession: (name: string): Promise<FileResult> => ipcRenderer.invoke(IPC_CHANNELS.sessionsRename, name),
  exportSession: (title: string): Promise<FileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsExport, title),
  getSessionStats: (): Promise<SessionStatsDTO> => ipcRenderer.invoke(IPC_CHANNELS.sessionsStats),
  getSessionSettings: (): Promise<SessionSettingsDTO> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsSettings),
  setAutoCompaction: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.sessionsSetAutoCompaction, enabled),

  switchModel: (provider: string, model: string): Promise<ConnectResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.modelSwitch, provider, model),
  disconnect: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.modelDisconnect),
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
  respondToolPermission: (requestId: string, allowed: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.chatPermissionRespond, requestId, allowed),
  onChatEvent: (callback: (event: ChatEvent) => void): void => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.chatEvent);
    ipcRenderer.on(IPC_CHANNELS.chatEvent, (_event, payload: ChatEvent) => callback(payload));
  },
};

contextBridge.exposeInMainWorld("pi", pi);
