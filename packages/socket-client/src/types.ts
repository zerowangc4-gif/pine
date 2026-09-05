/**
 * Types owned by `@pine/socket-client` only.
 *
 * Wire contracts stay in `@pine/protocol`. Import them there — do not alias or
 * re-export `Result`, event maps, or request payload types from this file.
 */

import type {
	ClientRequestArgs,
	ClientRequestName,
	ClientResponseData,
	ClientToServerEvents,
	ServerToClientEvents,
} from "@pine/protocol";
import type { Socket } from "socket.io-client";
import type { PineSend } from "./send.ts";
import type { PineSubscribe } from "./subscribe.ts";

/**
 * Socket.IO client instance typed with the protocol event maps.
 * Not in protocol (protocol has no Socket.IO dependency).
 */
export type PineSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Constructor options for {@link createPineSocketClient}. */
export interface PineSocketClientOptions {
	/**
	 * Full Socket.IO URL. Defaults to `http://127.0.0.1:${RUNTIME_PORT}` from protocol.
	 * Web builds can point at a remote sidecar or a reverse proxy.
	 */
	url?: string;
	/** How long to wait for an ack before rejecting. Default 60s. */
	requestTimeoutMs?: number;
}

/**
 * Raw Socket.IO transport lifecycle (connect / disconnect / connect_error).
 * Not part of `ServerToClientEvents` — those are protocol pushes after `ready`.
 */
export interface TransportHandlers {
	/** Socket.IO `connect`. `recovered` means room/packet recovery ran. */
	onConnect: (info: { recovered: boolean }) => void;
	/** Socket.IO `disconnect`. */
	onDisconnect: (reason: string) => void;
	/** Socket.IO `connect_error` as a human-readable message. */
	onConnectError: (message: string) => void;
}

/**
 * Public surface of {@link createPineSocketClient}.
 * Store-agnostic: apps bind transport/subscribe into Redux, Zustand, etc.
 */
export interface PineSocketClient {
	/** Underlying Socket.IO instance (prefer `send` / `subscribe` when possible). */
	readonly socket: PineSocket;
	/** Named client → server emits (each waits for ack). */
	readonly send: PineSend;
	/** Named subscriptions for server → client events. */
	readonly subscribe: PineSubscribe;
	/** Whether the transport is currently connected. */
	readonly connected: boolean;
	/** Whether Socket.IO restored rooms/packets after a brief disconnect. */
	readonly recovered: boolean;
	/** Bind connect / disconnect / connect_error → app callbacks. */
	bindTransport(handlers: TransportHandlers): void;
	/** Open the connection (`autoConnect` is false until this runs). */
	connect(): void;
	/** Remove all listeners and disconnect (HMR / app teardown). */
	dispose(): void;
	/**
	 * Low-level typed emit + ack. Prefer `send.*` from application code.
	 * Uses protocol `ClientRequestName` / `ClientRequestArgs` / `ClientResponseData`
	 * and unwraps protocol `Result<T>`.
	 */
	request: <K extends ClientRequestName>(event: K, ...args: ClientRequestArgs<K>) => Promise<ClientResponseData<K>>;
	/**
	 * Subscribe to a protocol event (`ServerToClientEvents`). Prefer `subscribe.on*`.
	 * Returns an unsubscribe function.
	 */
	on: <K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]) => () => void;
}
