/**
 * Named server → client pushes — same file role as
 * `@pine/socket-client` `subscribe.ts`.
 *
 * Client: `subscribe.onAgentEvent(handler)` listens.
 * Server: `subscribe.agentEvent(payload)` emits.
 */

import type { ServerEmit, ServerToClientEvents } from "@pine/protocol";

/** Build the subscribe-channel API bound to one emit (socket or room). */
export function createSubscribe(emit: ServerEmit) {
	return {
		/**
		 * Emit `ready` → client `subscribe.onReady`.
		 */
		ready(payload: Parameters<ServerToClientEvents["ready"]>[0]) {
			emit("ready", payload);
		},

		/**
		 * Emit `agent:event` → client `subscribe.onAgentEvent`.
		 */
		agentEvent(payload: Parameters<ServerToClientEvents["agent:event"]>[0]) {
			emit("agent:event", payload);
		},

		/**
		 * Emit `session:state` → client `subscribe.onSessionState`.
		 */
		sessionState(payload: Parameters<ServerToClientEvents["session:state"]>[0]) {
			emit("session:state", payload);
		},

		/**
		 * Emit `session:runEnd` → client `subscribe.onSessionRunEnd`.
		 */
		sessionRunEnd(payload: Parameters<ServerToClientEvents["session:runEnd"]>[0]) {
			emit("session:runEnd", payload);
		},

		/**
		 * Emit `session:resources` → client `subscribe.onSessionResources`.
		 */
		sessionResources(payload: Parameters<ServerToClientEvents["session:resources"]>[0]) {
			emit("session:resources", payload);
		},

		/**
		 * Emit `session:compacted` → client `subscribe.onSessionCompacted`.
		 */
		sessionCompacted(payload: Parameters<ServerToClientEvents["session:compacted"]>[0]) {
			emit("session:compacted", payload);
		},

		/**
		 * Emit `session:stopRequested` → client `subscribe.onSessionStopRequested`.
		 */
		sessionStopRequested(payload: Parameters<ServerToClientEvents["session:stopRequested"]>[0]) {
			emit("session:stopRequested", payload);
		},

		/**
		 * Emit `session:turnPrepared` → client `subscribe.onSessionTurnPrepared`.
		 */
		sessionTurnPrepared(payload: Parameters<ServerToClientEvents["session:turnPrepared"]>[0]) {
			emit("session:turnPrepared", payload);
		},

		/**
		 * Emit `session:closed` → client `subscribe.onSessionClosed`.
		 */
		sessionClosed(payload: Parameters<ServerToClientEvents["session:closed"]>[0]) {
			emit("session:closed", payload);
		},

		/**
		 * Emit `session:workspace` → client `subscribe.onSessionWorkspace`.
		 */
		sessionWorkspace(payload: Parameters<ServerToClientEvents["session:workspace"]>[0]) {
			emit("session:workspace", payload);
		},

		/**
		 * Emit `tool:approvalRequest` → client `subscribe.onToolApprovalRequest`.
		 */
		toolApprovalRequest(payload: Parameters<ServerToClientEvents["tool:approvalRequest"]>[0]) {
			emit("tool:approvalRequest", payload);
		},

		/**
		 * Emit `tool:approvalResolved` → client `subscribe.onToolApprovalResolved`.
		 */
		toolApprovalResolved(payload: Parameters<ServerToClientEvents["tool:approvalResolved"]>[0]) {
			emit("tool:approvalResolved", payload);
		},

		/**
		 * Emit `tool:resultAdjusted` → client `subscribe.onToolResultAdjusted`.
		 */
		toolResultAdjusted(payload: Parameters<ServerToClientEvents["tool:resultAdjusted"]>[0]) {
			emit("tool:resultAdjusted", payload);
		},

		/**
		 * Emit `debug:payload` → client `subscribe.onDebugPayload`.
		 */
		debugPayload(payload: Parameters<ServerToClientEvents["debug:payload"]>[0]) {
			emit("debug:payload", payload);
		},

		/**
		 * Emit `debug:response` → client `subscribe.onDebugResponse`.
		 */
		debugResponse(payload: Parameters<ServerToClientEvents["debug:response"]>[0]) {
			emit("debug:response", payload);
		},

		/**
		 * Emit `log` → client `subscribe.onLog`.
		 */
		log(payload: Parameters<ServerToClientEvents["log"]>[0]) {
			emit("log", payload);
		},

		/** Underlying protocol emit (for `AgentSession` which still takes `ServerEmit`). */
		raw: emit,
	};
}

export type PineSubscribe = ReturnType<typeof createSubscribe>;
