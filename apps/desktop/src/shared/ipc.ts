/**
 * IPC channel names shared between the main process and the preload bridge.
 * Keeping them in one place prevents typos and drift between the two sides.
 */
export const IPC_CHANNELS = {
  providersList: "pi:list-providers",
  connect: "pi:connect",

  filesOpenFolder: "files:open-folder",
  filesReadDir: "files:read-dir",
  filesCreateFile: "files:create-file",
  filesCreateFolder: "files:create-folder",
  filesRename: "files:rename",
  filesDelete: "files:delete",
  filesReveal: "files:reveal",
  filesReadFile: "files:read-file",
  filesWriteFile: "files:write-file",
  filesChanged: "files:changed",

  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsDelete: "sessions:delete",
  sessionsNew: "sessions:new",
  sessionsRename: "sessions:rename",
  sessionsStats: "sessions:stats",

  modelSwitch: "model:switch",
  modelThinkingLevel: "model:thinking-level",
  modelActive: "model:active",

  systemCopyText: "system:copy-text",

  chatSend: "chat:send",
  chatAbort: "chat:abort",
  chatEvent: "chat:event",
} as const;
