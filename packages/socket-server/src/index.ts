/**
 * `@pine/socket-server` — Redux-free Socket.IO server contract for the Pine sidecar.
 *
 * Mirror of `@pine/socket-client`:
 * - `createSend` — register handlers for every client→server emit (`send.ts`)
 * - `createSubscribe` — every server→client push (`subscribe.ts`)
 *
 * Runtime owns session/agent business; this package only names the wire surface.
 */

export type { PineSend } from "./send.ts";
export { createSend } from "./send.ts";
export type { PineSubscribe } from "./subscribe.ts";
export { createSubscribe } from "./subscribe.ts";
export type { PineServer, PineSocket } from "./types.ts";
