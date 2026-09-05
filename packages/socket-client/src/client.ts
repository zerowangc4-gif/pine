/**
 * Redux-free Pine sidecar Socket.IO client.
 *
 * Owns: connection, typed `request` (emit + ack), named `send` / `subscribe` APIs.
 * Does not own: UI state. Desktop/web bind transport + subscribe into their stores.
 * Types live in `types.ts`.
 */

import { type ClientResponseData, type Result, RUNTIME_PORT } from "@pine/protocol";
import { io } from "socket.io-client";
import { createSend } from "./send.ts";
import { createSubscribe } from "./subscribe.ts";
import type { PineSocket, PineSocketClient, PineSocketClientOptions, TransportHandlers } from "./types.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Turn an unknown transport error into a short string. */
function describeSocketError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Create a Pine sidecar client.
 *
 * Shared by desktop and (future) web. Construct one instance per app window.
 */
export function createPineSocketClient(options: PineSocketClientOptions = {}): PineSocketClient {
	const url = options.url ?? `http://127.0.0.1:${RUNTIME_PORT}`;
	const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

	const socket: PineSocket = io(url, {
		transports: ["websocket"],
		reconnection: true,
		reconnectionDelay: 500,
		reconnectionDelayMax: 5000,
		timeout: 8000,
		autoConnect: false,
	});

	const request: PineSocketClient["request"] = (event, ...args) =>
		new Promise<never>((resolve, reject) => {
			if (!socket.connected) {
				reject(new Error("Not connected to the Pine sidecar."));
				return;
			}

			const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), requestTimeoutMs);
			const ack = (result: Result<ClientResponseData<typeof event>>): void => {
				clearTimeout(timer);
				if (result.ok) resolve(result.data as never);
				else reject(new Error(result.error));
			};

			(socket.emit as (name: string, ...rest: unknown[]) => void)(event, ...args, ack);
		});

	const on: PineSocketClient["on"] = (event, handler) => {
		socket.on(event, handler as never);
		return () => {
			socket.off(event, handler as never);
		};
	};

	const send = createSend(request);
	const subscribe = createSubscribe(on);

	return {
		socket,
		send,
		subscribe,

		get connected() {
			return socket.connected;
		},

		get recovered() {
			return Boolean(socket.recovered);
		},

		bindTransport(handlers: TransportHandlers) {
			socket.on("connect", () => {
				handlers.onConnect({ recovered: Boolean(socket.recovered) });
			});
			socket.on("disconnect", (reason) => {
				handlers.onDisconnect(reason);
			});
			socket.on("connect_error", (error) => {
				handlers.onConnectError(describeSocketError(error));
			});
		},

		connect() {
			socket.connect();
		},

		dispose() {
			socket.removeAllListeners();
			socket.disconnect();
		},

		request,
		on,
	};
}
