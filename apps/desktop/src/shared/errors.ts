/**
 * User-facing error codes emitted by the main process.
 *
 * The main process returns these keys instead of localized strings. The
 * renderer translates keys starting with `error.` via i18n and renders raw
 * technical messages (e.g. SDK/network errors) unchanged.
 */
export const AppError = {
  noFolder: "error.noFolder",
  notConnected: "error.notConnected",
  modelNotFound: "error.modelNotFound",
  connectFailed: "error.connectFailed",
  pathOutsideRoot: "error.pathOutsideRoot",
  nameExists: "error.nameExists",
  nameRequired: "error.nameRequired",
  operationFailed: "error.operationFailed",
  streaming: "error.streaming",
  cannotDeleteRoot: "error.cannotDeleteRoot",
  sessionNotFound: "error.sessionNotFound",
  sessionLoadFailed: "error.sessionLoadFailed",
  apiKeyRequired: "error.apiKeyRequired",
  noActiveSession: "error.noActiveSession",
  binaryFile: "error.binaryFile",
} as const;
