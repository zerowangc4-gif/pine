/**
 * Named subscriptions for sidecar → client events (every protocol `on`).
 *
 * From the client's point of view this is subscribe, not "push" — the server
 * pushes, the client subscribes. Each helper maps 1:1 to a `ServerToClientEvents`
 * key and returns an unsubscribe function. Handler types come from `@pine/protocol`.
 */

import type { ServerToClientEvents } from "@pine/protocol";

/** Low-level `on` — same shape as `PineSocketClient.on`. */
type OnFn = <K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]) => () => void;

/** Build the subscribe API bound to one live client `on` function. */
export function createSubscribe(on: OnFn) {
	return {
		/**
		 * On `ready`.
		 * First protocol frame after the Socket.IO connection is up: version,
		 * node/platform, cwd, sessions root, and live session ids.
		 */
		onReady(handler: ServerToClientEvents["ready"]) {
			return on("ready", handler);
		},

		/**
		 * On `agent:event`.
		 * Verbatim agent-loop event (`message_update`, tool progress, …).
		 * `seq` is monotonic per session for ordering.
		 */
		onAgentEvent(handler: ServerToClientEvents["agent:event"]) {
			return on("agent:event", handler);
		},

		/**
		 * On `session:state`.
		 * Server sends a fresh snapshot (config, messages, queues, approvals).
		 * Distinct from the client pull `session:getState`.
		 */
		onSessionState(handler: ServerToClientEvents["session:state"]) {
			return on("session:state", handler);
		},

		/**
		 * On `session:runEnd`.
		 * The current agent run finished (stop reason and optional error).
		 */
		onSessionRunEnd(handler: ServerToClientEvents["session:runEnd"]) {
			return on("session:runEnd", handler);
		},

		/**
		 * On `session:resources`.
		 * Skills/templates catalog changed (reload or workspace switch).
		 */
		onSessionResources(handler: ServerToClientEvents["session:resources"]) {
			return on("session:resources", handler);
		},

		/**
		 * On `session:compacted`.
		 * Context compaction completed (`automatic` vs user-triggered).
		 */
		onSessionCompacted(handler: ServerToClientEvents["session:compacted"]) {
			return on("session:compacted", handler);
		},

		/**
		 * On `session:stopRequested`.
		 * A graceful stop was armed for the end of the current turn.
		 */
		onSessionStopRequested(handler: ServerToClientEvents["session:stopRequested"]) {
			return on("session:stopRequested", handler);
		},

		/**
		 * On `session:turnPrepared`.
		 * Deferred config changes (model/tools/…) took effect at a turn boundary.
		 */
		onSessionTurnPrepared(handler: ServerToClientEvents["session:turnPrepared"]) {
			return on("session:turnPrepared", handler);
		},

		/**
		 * On `session:closed`.
		 * The session was closed; UI should clear local session state.
		 */
		onSessionClosed(handler: ServerToClientEvents["session:closed"]) {
			return on("session:closed", handler);
		},

		/**
		 * On `session:workspace`.
		 * Workspace root changed for this session.
		 */
		onSessionWorkspace(handler: ServerToClientEvents["session:workspace"]) {
			return on("session:workspace", handler);
		},

		/**
		 * On `tool:approvalRequest`.
		 * Agent is blocked waiting for the user to allow/deny a tool call.
		 */
		onToolApprovalRequest(handler: ServerToClientEvents["tool:approvalRequest"]) {
			return on("tool:approvalRequest", handler);
		},

		/**
		 * On `tool:approvalResolved`.
		 * A pending approval was answered (this window or another).
		 */
		onToolApprovalResolved(handler: ServerToClientEvents["tool:approvalResolved"]) {
			return on("tool:approvalResolved", handler);
		},

		/**
		 * On `tool:resultAdjusted`.
		 * Runtime rewrote a tool result (e.g. truncated large output).
		 */
		onToolResultAdjusted(handler: ServerToClientEvents["tool:resultAdjusted"]) {
			return on("tool:resultAdjusted", handler);
		},

		/**
		 * On `debug:payload`.
		 * Outbound provider request body captured for the inspector.
		 */
		onDebugPayload(handler: ServerToClientEvents["debug:payload"]) {
			return on("debug:payload", handler);
		},

		/**
		 * On `debug:response`.
		 * Provider HTTP status/headers captured for the inspector.
		 */
		onDebugResponse(handler: ServerToClientEvents["debug:response"]) {
			return on("debug:response", handler);
		},

		/**
		 * On `log`.
		 * Sidecar log line (info/warn/error) for the active session.
		 */
		onLog(handler: ServerToClientEvents["log"]) {
			return on("log", handler);
		},
	};
}

export type PineSubscribe = ReturnType<typeof createSubscribe>;
