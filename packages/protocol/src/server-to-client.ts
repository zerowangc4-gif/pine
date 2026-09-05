/**
 * Sidecar → frontend (pushes).
 *
 * Broadcast into `session:<id>` rooms. Nothing in this file is a client
 * request — those live in `client-to-server.ts`.
 */

import type { AgentEvent } from "./events.ts";
import type {
	AgentStateSnapshot,
	CompactionState,
	SessionResources,
	StopReason,
	ToolApprovalDecision,
	ToolApprovalRequest,
} from "./state.ts";

// ---------------------------------------------------------------------------
// Push payloads
// ---------------------------------------------------------------------------

export interface RuntimeInfo {
	protocolVersion: number;
	node: string;
	platform: string;
	cwd: string;
	sessionsRoot: string;
	/** Sessions already running in this sidecar, so a fresh window can adopt one. */
	liveSessionIds: string[];
}

export interface RunEnded {
	sessionId: string;
	stopReason?: StopReason;
	errorMessage?: string;
}

export interface LogLine {
	sessionId?: string;
	level: "info" | "warn" | "error";
	message: string;
}

// ---------------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
	/** First frame after a connection is established. */
	ready: (info: RuntimeInfo) => void;

	/** Verbatim `AgentEvent`. `seq` is monotonic per session, for ordering. */
	"agent:event": (payload: { sessionId: string; seq: number; event: AgentEvent }) => void;

	/** Server pushes a fresh snapshot (not the client pull `session:getState`). */
	"session:state": (state: AgentStateSnapshot) => void;
	"session:runEnd": (payload: RunEnded) => void;
	"session:resources": (payload: { sessionId: string; resources: SessionResources }) => void;
	"session:compacted": (payload: { sessionId: string; compaction: CompactionState; automatic: boolean }) => void;
	"session:stopRequested": (payload: { sessionId: string; reason: StopReason }) => void;
	/** A deferred configuration change took effect at a turn boundary. */
	"session:turnPrepared": (payload: { sessionId: string; changes: string[] }) => void;
	"session:closed": (payload: { sessionId: string }) => void;
	/** The session's workspace root changed. */
	"session:workspace": (payload: { sessionId: string; workspace: string }) => void;

	"tool:approvalRequest": (payload: { sessionId: string; request: ToolApprovalRequest }) => void;
	"tool:approvalResolved": (payload: {
		sessionId: string;
		approvalId: string;
		decision: ToolApprovalDecision;
	}) => void;
	/** `afterToolCall` rewrote a tool result, e.g. truncated it. */
	"tool:resultAdjusted": (payload: { sessionId: string; toolCallId: string; reason: string }) => void;

	"debug:payload": (payload: { sessionId: string; seq: number; payload: unknown }) => void;
	"debug:response": (payload: {
		sessionId: string;
		seq: number;
		status: number;
		headers: Record<string, string>;
	}) => void;

	log: (line: LogLine) => void;
}

/**
 * Typed broadcast function handed to a session.
 *
 * The session emits capability events without knowing about sockets or rooms;
 * the hub supplies an implementation that fans out to the session's room.
 */
export type ServerEmit = <K extends keyof ServerToClientEvents>(
	event: K,
	...args: Parameters<ServerToClientEvents[K]>
) => void;
