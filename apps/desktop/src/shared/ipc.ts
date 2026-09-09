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
  filesReadFile: "files:read-file",
  filesWriteFile: "files:write-file",

  chatSend: "chat:send",
  chatAbort: "chat:abort",
  chatEvent: "chat:event",
} as const;
