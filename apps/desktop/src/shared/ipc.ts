/**
 * IPC channel names shared between the main process and the preload bridge.
 * Keeping them in one place prevents typos and drift between the two sides.
 */
export const IPC_CHANNELS = {
  providersList: "pi:list-providers",
  connect: "pi:connect",

  filesExecute: "files:execute",
  filesChanged: "files:changed",

  sessionsList: "sessions:list",
  sessionsLoad: "sessions:load",
  sessionsDelete: "sessions:delete",
  sessionsNew: "sessions:new",
  sessionsRename: "sessions:rename",
  sessionsExport: "sessions:export",
  sessionsStats: "sessions:stats",
  sessionsSettings: "sessions:settings",
  sessionsSetAutoCompaction: "sessions:set-auto-compaction",

  modelSwitch: "model:switch",
  modelDisconnect: "model:disconnect",
  modelThinkingLevel: "model:thinking-level",
  modelActive: "model:active",
  modelActiveTools: "model:active-tools",
  modelSetActiveTools: "model:set-active-tools",

  systemCopyText: "system:copy-text",
  systemReadClipboardImage: "system:read-clipboard-image",

  chatSend: "chat:send",
  chatAbort: "chat:abort",
  chatPermissionRespond: "chat:permission-respond",
  chatEvent: "chat:event",
} as const;
