/**
 * Socket.IO event contract.
 *
 * Two maps, both fully typed so the server and the UI cannot disagree:
 *
 * - `ClientToServerEvents` — requests. Every one takes an acknowledgement
 *   callback, so Socket.IO handles request/response correlation and there is
 *   no hand-rolled message id anywhere in the codebase.
 * - `ServerToClientEvents` — pushes. These are broadcast into the room
 *   `sessionRoom(sessionId)`, so every window watching a session receives them
 *   and a socket that never joined receives nothing.
 */

import type { AgentConfig, AgentConfigPatch, ModelSpec, ThinkingLevel } from "./config.ts";
import type { AgentEvent } from "./events.ts";
import type { AgentMessage, ImageContent } from "./messages.ts";
import type {
	AgentStateSnapshot,
	CompactionState,
	DirectoryListing,
	ModelInspection,
	QueueName,
	QueuedMessagePreview,
	SessionResources,
	StopReason,
	StoredSessionInfo,
	ToolApprovalDecision,
	ToolApprovalRequest,
	WorkspaceValidation,
} from "./state.ts";

/** Default sidecar port. Override with `PINE_RUNTIME_PORT`. */
export const RUNTIME_PORT = 7821;

/** Bumped whenever the contract changes shape; the UI warns on a mismatch. */
export const PROTOCOL_VERSION = 3;

/** Socket.IO room that carries every push for one session. */
export function sessionRoom(sessionId: string): string {
	return `session:${sessionId}`;
}

// ---------------------------------------------------------------------------
// Acknowledgements
// ---------------------------------------------------------------------------

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export type Ack<T> = (result: Result<T>) => void;

export function ok<T>(data: T): Result<T> {
	return { ok: true, data };
}

export function fail(error: unknown, code?: string): Result<never> {
	const message = error instanceof Error ? error.message : String(error);
	return code ? { ok: false, error: message, code } : { ok: false, error: message };
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface OpenSessionRequest {
	config: AgentConfig;
	/** Reattach to a live session, or resume one from its stored transcript. */
	resumeSessionId?: string;
}

export interface SessionOpened {
	state: AgentStateSnapshot;
	resources: SessionResources;
	/** True when an already-running session was reattached rather than created. */
	reattached: boolean;
}

export interface PromptRequest {
	sessionId: string;
	text?: string;
	images?: ImageContent[];
	/** Bypasses text/image composition and prompts with prebuilt messages. */
	messages?: AgentMessage[];
}

export interface QueueRequest {
	sessionId: string;
	text: string;
	images?: ImageContent[];
}

export interface WorkspaceBrowseRequest {
	/** Absolute or `~`-relative path. Empty lists the sidecar working directory. */
	path?: string;
	/** Include dot-directories and other normally hidden entries. */
	includeHidden?: boolean;
}

export interface SwitchWorkspaceRequest {
	sessionId: string;
	path: string;
}

export interface SwitchWorkspaceResult {
	state: AgentStateSnapshot;
	resources: SessionResources;
	validation: WorkspaceValidation;
}

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
	// --- lifecycle ---------------------------------------------------------
	"session:open": (request: OpenSessionRequest, ack: Ack<SessionOpened>) => void;
	"session:close": (sessionId: string, ack: Ack<null>) => void;
	"session:state": (sessionId: string, ack: Ack<AgentStateSnapshot>) => void;

	// --- conversation ------------------------------------------------------
	/** `Agent.prompt`. Acknowledged when the run *starts*, not when it ends. */
	"session:prompt": (request: PromptRequest, ack: Ack<AgentStateSnapshot>) => void;
	/** `Agent.continue`: another turn with no new user message. */
	"session:continue": (sessionId: string, ack: Ack<AgentStateSnapshot>) => void;
	/** `Agent.steer`: inject before the next assistant response. */
	"session:steer": (request: QueueRequest, ack: Ack<QueuedMessagePreview>) => void;
	/** `Agent.followUp`: run once the agent would otherwise stop. */
	"session:followUp": (request: QueueRequest, ack: Ack<QueuedMessagePreview>) => void;
	"session:clearQueue": (
		request: { sessionId: string; queue: QueueName | "all" },
		ack: Ack<AgentStateSnapshot>,
	) => void;

	// --- control -----------------------------------------------------------
	"session:abort": (sessionId: string, ack: Ack<AgentStateSnapshot>) => void;
	"session:requestStop": (request: { sessionId: string; cancel: boolean }, ack: Ack<AgentStateSnapshot>) => void;

	// --- transcript --------------------------------------------------------
	"session:reset": (sessionId: string, ack: Ack<AgentStateSnapshot>) => void;
	"session:setMessages": (
		request: { sessionId: string; messages: AgentMessage[] },
		ack: Ack<AgentStateSnapshot>,
	) => void;
	/** Drop everything from `index` onward. */
	"session:truncate": (request: { sessionId: string; index: number }, ack: Ack<AgentStateSnapshot>) => void;
	"session:compact": (
		request: { sessionId: string; customInstructions?: string },
		ack: Ack<{ state: AgentStateSnapshot; compaction?: CompactionState }>,
	) => void;

	// --- configuration -----------------------------------------------------
	"session:configure": (
		request: { sessionId: string; patch: AgentConfigPatch },
		ack: Ack<AgentStateSnapshot>,
	) => void;

	// --- resources ---------------------------------------------------------
	"session:runSkill": (
		request: { sessionId: string; name: string; additionalInstructions?: string },
		ack: Ack<AgentStateSnapshot>,
	) => void;
	"session:runTemplate": (
		request: { sessionId: string; name: string; args: string[] },
		ack: Ack<AgentStateSnapshot>,
	) => void;
	"session:reloadResources": (sessionId: string, ack: Ack<SessionResources>) => void;

	// --- workspace ---------------------------------------------------------
	"workspace:browse": (request: WorkspaceBrowseRequest, ack: Ack<DirectoryListing>) => void;
	"workspace:validate": (path: string, ack: Ack<WorkspaceValidation>) => void;
	/** Repoint a live session at another directory, rebuilding tools and resources. */
	"workspace:switch": (request: SwitchWorkspaceRequest, ack: Ack<SwitchWorkspaceResult>) => void;
	/** Workspaces seen in stored transcripts, most recent first. */
	"workspace:recent": (ack: Ack<string[]>) => void;

	// --- approvals ---------------------------------------------------------
	"tool:approve": (
		request: { sessionId: string; approvalId: string; decision: ToolApprovalDecision },
		ack: Ack<AgentStateSnapshot>,
	) => void;

	// --- stored sessions ---------------------------------------------------
	"sessions:list": (request: { cwd?: string }, ack: Ack<StoredSessionInfo[]>) => void;
	"sessions:delete": (sessionId: string, ack: Ack<null>) => void;

	// --- diagnostics -------------------------------------------------------
	"model:inspect": (request: { model: ModelSpec; apiKey: string }, ack: Ack<ModelInspection>) => void;
}

// ---------------------------------------------------------------------------
// Server -> client
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

export interface ServerToClientEvents {
	/** First frame after a connection is established. */
	ready: (info: RuntimeInfo) => void;

	/** Verbatim `AgentEvent`. `seq` is monotonic per session, for ordering. */
	"agent:event": (payload: { sessionId: string; seq: number; event: AgentEvent }) => void;

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

/** Thinking levels the UI offers when no session has reported real support yet. */
export const FALLBACK_THINKING_LEVELS: ThinkingLevel[] = ["off"];
