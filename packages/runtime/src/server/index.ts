/**
 * The Pine sidecar: a Socket.IO server exposing one `AgentSession` per chat.
 *
 * Lifecycle of a connection:
 *  1. Socket.IO completes its handshake.
 *  2. The server sends `ready` with runtime facts and the ids of live sessions.
 *  3. The client sends `session:open`, joining that session's room.
 *  4. Broadcasts flow into the room until the session is closed.
 *
 * Connection recovery is delegated to Socket.IO's `connectionStateRecovery`:
 * a client that drops and returns within the window is put back into its rooms
 * with the packets it missed replayed. Past the window the client reconnects
 * as new and reattaches explicitly with `session:open` + `resumeSessionId`,
 * which is also the path taken after a full sidecar restart.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { PROTOCOL_VERSION, RUNTIME_PORT, type ClientToServerEvents, type ServerToClientEvents } from "@pine/protocol";
import { SessionStore } from "../persistence.ts";
import type { HandlerModule, RuntimeContext } from "./context.ts";
import { libraryHandlers } from "./handlers/library.ts";
import { sessionHandlers } from "./handlers/session.ts";
import { workspaceHandlers } from "./handlers/workspace.ts";
import { SessionHub } from "./hub.ts";

/** How long a dropped client can return and still have its rooms restored. */
const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

const HANDLERS: HandlerModule[] = [sessionHandlers, workspaceHandlers, libraryHandlers];

export interface RuntimeServerHandle {
	io: Server<ClientToServerEvents, ServerToClientEvents>;
	http: HttpServer;
	hub: SessionHub;
	port: number;
	close(): Promise<void>;
}

export function createRuntimeServer(port = RUNTIME_PORT): RuntimeServerHandle {
	const http = createServer();
	const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
		// The sidecar is loopback only, but the Vite dev server and the Tauri
		// webview are different origins from it, so CORS has to be permissive.
		cors: { origin: "*" },
		connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS },
		// Provider payloads and long transcripts can be large.
		maxHttpBufferSize: 32 * 1024 * 1024,
	});

	const store = new SessionStore();
	const hub = new SessionHub(io, store, process.cwd());
	const context: RuntimeContext = { io, hub, store, baseDir: process.cwd() };

	io.on("connection", (socket) => {
		for (const register of HANDLERS) register(socket, context);

		// Sent last, so a client that reacts to `ready` by issuing requests always
		// finds its handlers already attached.
		socket.emit("ready", {
			protocolVersion: PROTOCOL_VERSION,
			node: process.version,
			platform: process.platform,
			cwd: process.cwd(),
			sessionsRoot: store.sessionsRoot,
			liveSessionIds: hub.liveIds(),
		});
	});

	http.listen(port, "127.0.0.1", () => {
		console.error(`[pine-runtime] listening on http://127.0.0.1:${port}`);
		console.error(`[pine-runtime] transcripts in ${store.sessionsRoot}`);
	});

	http.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code === "EADDRINUSE") {
			console.error(`[pine-runtime] port ${port} already in use; assuming another Pine runtime is running`);
			process.exit(0);
		}
		console.error("[pine-runtime] server error:", error);
		process.exit(1);
	});

	const close = async (): Promise<void> => {
		await hub.closeAll();
		await io.close();
	};

	const shutdown = (): void => {
		void close().finally(() => process.exit(0));
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	return { io, http, hub, port, close };
}
