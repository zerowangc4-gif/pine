/**
 * Shared plumbing for the Socket.IO handlers.
 *
 * Every handler follows the same shape: read a typed request, do the work, and
 * settle the acknowledgement exactly once. `guard` enforces that shape so no
 * handler can leave a client waiting on a promise that rejected.
 */

import type { Server, Socket } from "socket.io";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@pine/protocol";
import { fail, ok } from "@pine/protocol";
import type { SessionStore } from "../persistence.ts";
import type { SessionHub } from "./hub.ts";

export type RuntimeServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type RuntimeSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface RuntimeContext {
	io: RuntimeServer;
	hub: SessionHub;
	store: SessionStore;
	/** Directory relative paths resolve against: the sidecar's own cwd. */
	baseDir: string;
}

/**
 * Run a handler body and acknowledge the outcome.
 *
 * Returns void rather than a promise: Socket.IO does not await listeners, and
 * the acknowledgement is the only channel a client waits on.
 */
export function guard<T>(ack: Ack<T>, run: () => Promise<T> | T): void {
	void (async () => {
		try {
			ack(ok(await run()));
		} catch (error) {
			ack(fail(error));
		}
	})();
}

/** A handler module: attaches its listeners to one freshly connected socket. */
export type HandlerModule = (socket: RuntimeSocket, context: RuntimeContext) => void;
