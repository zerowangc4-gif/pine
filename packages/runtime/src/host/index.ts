/**
 * Sidecar host process: HTTP listen + Socket.IO accept loop.
 *
 * Not the wire contract (`@pine/socket-server`) and not session logic
 * (`session/`). This layer only boots the process and hands each connection
 * to `socket/` attach helpers.
 *
 * Lifecycle of a connection (mirrors desktop `App` + `socket/`):
 *  1. Socket.IO completes its handshake.
 *  2. `attachSend` registers every client→server handler.
 *  3. `attachSubscribe` pushes `ready`.
 *  4. The client opens/reattaches a session; room pushes follow.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { type ClientToServerEvents, RUNTIME_PORT, type ServerToClientEvents } from "@pine/protocol";
import { Server } from "socket.io";
import { SessionStore } from "../domain/persistence.ts";
import { SessionHub } from "../session/hub.ts";
import { createRuntimeContext } from "../socket/instance.ts";
import { attachSend } from "../socket/send.ts";
import { attachSubscribe } from "../socket/subscribe.ts";

/** How long a dropped client can return and still have its rooms restored. */
const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

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
		cors: { origin: "*" },
		connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS },
		maxHttpBufferSize: 32 * 1024 * 1024,
	});

	const store = new SessionStore();
	const hub = new SessionHub(io, store, process.cwd());
	const context = createRuntimeContext(io, hub, store);

	io.on("connection", (socket) => {
		attachSend(socket, context);
		attachSubscribe(socket, context);
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
