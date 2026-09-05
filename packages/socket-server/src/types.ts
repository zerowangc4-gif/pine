/**
 * Types owned by `@pine/socket-server` only.
 *
 * Wire contracts stay in `@pine/protocol`. Import them there — do not alias or
 * re-export `Result`, event maps, or request payload types from this file.
 *
 * Mirrors `@pine/socket-client` `types.ts`.
 */

import type { ClientToServerEvents, ServerToClientEvents } from "@pine/protocol";
import type { Server, Socket } from "socket.io";

/**
 * Socket.IO server instance typed with the protocol event maps.
 * Not in protocol (protocol has no Socket.IO dependency).
 */
export type PineServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Socket.IO connection typed with the protocol event maps.
 * Mirror of client `PineSocket`.
 */
export type PineSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
