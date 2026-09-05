/**
 * `@pine/socket-client` — Redux-free Socket.IO client for the Pine sidecar.
 *
 * - {@link createPineSocketClient} — connection + `request` + transport hooks
 * - `client.send.*` — every client→server emit (documented in `send.ts`)
 * - `client.subscribe.on*` — every server→client event (documented in `subscribe.ts`)
 *
 * Apps (desktop / web) own store wiring; this package never imports UI state.
 */

export { createPineSocketClient } from "./client.ts";
export type { PineSend } from "./send.ts";
export type { PineSubscribe } from "./subscribe.ts";
export type {
	PineSocket,
	PineSocketClient,
	PineSocketClientOptions,
	TransportHandlers,
} from "./types.ts";
