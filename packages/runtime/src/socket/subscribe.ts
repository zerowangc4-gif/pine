/**
 * Runtime subscribe surface — open this file to see every server→client push.
 *
 * Same names as `@pine/socket-server` `subscribe.*`
 * (client listens via `@pine/socket-client` `subscribe.on*`).
 *
 *  - Connection-scoped: {@link attachSubscribe} (`ready`)
 *  - Session-scoped: {@link createRoomSubscribe} (AgentSession + SessionHub)
 *
 * Inventory (1:1 with package):
 *  ready, agentEvent, sessionState, sessionRunEnd, sessionResources,
 *  sessionCompacted, sessionStopRequested, sessionTurnPrepared, sessionClosed,
 *  sessionWorkspace, toolApprovalRequest, toolApprovalResolved, toolResultAdjusted,
 *  debugPayload, debugResponse, log
 */

import { PROTOCOL_VERSION, sessionRoom } from "@pine/protocol";
import { createSubscribe, type PineSubscribe } from "@pine/socket-server";
import type { RuntimeContext, RuntimeServer, RuntimeSocket } from "./instance.ts";

/**
 * Connection pushes on this socket.
 * Currently: `ready` → client `subscribe.onReady`.
 */
export function attachSubscribe(socket: RuntimeSocket, context: RuntimeContext): void {
	const { hub, store } = context;
	const subscribe = createSubscribe((event, ...args) => {
		socket.emit(event, ...args);
	});

	/** Emit `ready` → client `subscribe.onReady`. */
	subscribe.ready({
		protocolVersion: PROTOCOL_VERSION,
		node: process.version,
		platform: process.platform,
		cwd: process.cwd(),
		sessionsRoot: store.sessionsRoot,
		liveSessionIds: hub.liveIds(),
	});
}

/**
 * Session-room push API (`session:<id>`).
 * Passed to `AgentSession` as `subscribe`; hub also uses `sessionClosed`.
 *
 * AgentSession calls (via this object):
 *  - agentEvent, sessionState, sessionRunEnd, sessionResources, sessionCompacted
 *  - sessionStopRequested, sessionTurnPrepared, sessionWorkspace
 *  - toolApprovalRequest, toolApprovalResolved, toolResultAdjusted
 *  - debugPayload, debugResponse, log
 */
export function createRoomSubscribe(io: RuntimeServer, sessionId: string): PineSubscribe {
	const room = sessionRoom(sessionId);
	return createSubscribe((event, ...args) => {
		io.to(room).emit(event, ...args);
	});
}
