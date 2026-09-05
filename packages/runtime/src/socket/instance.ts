/**
 * Runtime socket wiring for the sidecar — mirror of `apps/desktop/src/socket`.
 *
 * One wire line (frontend contract → backend contract → runtime glue):
 *  `@pine/socket-client`  ↔  `@pine/socket-server`  ↔  this folder
 *
 * Layout:
 *  - `instance.ts`  — shared server context (io, hub, store)
 *  - `send.ts`      — every client→server handler (1:1 with package `send.*`)
 *  - `subscribe.ts` — every server→client push (1:1 with package `subscribe.*`)
 */

import type { PineServer, PineSocket } from "@pine/socket-server";
import type { SessionStore } from "../domain/persistence.ts";
import type { SessionHub } from "../session/hub.ts";

export type RuntimeServer = PineServer;
export type RuntimeSocket = PineSocket;

export interface RuntimeContext {
	io: RuntimeServer;
	hub: SessionHub;
	store: SessionStore;
	/** Directory relative paths resolve against: the sidecar's own cwd. */
	baseDir: string;
}

/** Build the shared context used by `send` / `subscribe` on every connection. */
export function createRuntimeContext(
	io: RuntimeServer,
	hub: SessionHub,
	store: SessionStore,
	baseDir = process.cwd(),
): RuntimeContext {
	return { io, hub, store, baseDir };
}
