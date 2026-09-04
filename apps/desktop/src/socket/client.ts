/**
 * The Socket.IO connection to the sidecar.
 *
 * One socket for the whole app. Reconnection is Socket.IO's job — exponential
 * backoff, unlimited attempts — because the Tauri shell starts the sidecar in
 * parallel with the window, so the first attempts routinely fail until it
 * binds, and a sidecar restart should be invisible.
 *
 * `request` turns an acknowledgement into a promise and rejects on a failed
 * result, so callers use ordinary try/catch.
 */

import { io, type Socket } from "socket.io-client";
import { RUNTIME_PORT, type Ack, type ClientToServerEvents, type ServerToClientEvents } from "@pine/protocol";

export type PineSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type RequestName = keyof ClientToServerEvents;

/**
 * Request arguments with the acknowledgement callback removed.
 *
 * Matches `Ack<any>` rather than `Ack<unknown>` because a callback is
 * contravariant in its payload, so `Ack<unknown>` would never match.
 */
type RequestArgs<K extends RequestName> = Parameters<ClientToServerEvents[K]> extends [
	...infer Rest,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Ack<any>,
]
	? Rest
	: never;

/** The value a successful acknowledgement carries. */
type ResponseData<K extends RequestName> = Parameters<ClientToServerEvents[K]> extends [
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	...any[],
	Ack<infer T>,
]
	? T
	: never;

/** Requests fail fast: the sidecar is local, so a slow ack means trouble. */
const REQUEST_TIMEOUT_MS = 60_000;

const port = Number(import.meta.env.VITE_PINE_RUNTIME_PORT ?? RUNTIME_PORT);

export const socket: PineSocket = io(`http://127.0.0.1:${port}`, {
	// WebSocket only: the sidecar is on loopback, so long-polling buys nothing
	// and would double the number of connections to reason about.
	transports: ["websocket"],
	reconnection: true,
	reconnectionDelay: 500,
	reconnectionDelayMax: 5000,
	timeout: 8000,
	autoConnect: false,
});

export function request<K extends RequestName>(event: K, ...args: RequestArgs<K>): Promise<ResponseData<K>> {
	// `Promise<never>` is assignable to every `Promise<ResponseData<K>>`, which
	// keeps the public signature exact with no cast at the call sites.
	return new Promise<never>((resolve, reject) => {
		if (!socket.connected) {
			reject(new Error("Not connected to the Pine sidecar."));
			return;
		}

		const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), REQUEST_TIMEOUT_MS);
		const ack = (result: { ok: boolean; data?: unknown; error?: string }): void => {
			clearTimeout(timer);
			if (result.ok) resolve(result.data as never);
			else reject(new Error(result.error ?? "The sidecar rejected the request."));
		};

		// Socket.IO's own types cannot express "spread these args, then append a
		// callback"; the exported signature above is what keeps callers honest.
		(socket.emit as (name: string, ...rest: unknown[]) => void)(event, ...args, ack);
	});
}

/** Human-readable message for a transport failure. */
export function describeSocketError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
