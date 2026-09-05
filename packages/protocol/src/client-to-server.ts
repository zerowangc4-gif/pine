/**
 * Frontend → sidecar (requests).
 *
 * Every event takes an acknowledgement callback (`Ack`). Nothing in this file
 * is a server push — those live in `server-to-client.ts`.
 */

import type { AgentConfig, AgentConfigPatch, ModelSpec } from "./config.ts";
import type { AgentMessage, ImageContent } from "./messages.ts";
import type {
	AgentStateSnapshot,
	CompactionState,
	DirectoryListing,
	ModelInspection,
	QueuedMessagePreview,
	QueueName,
	SessionResources,
	StoredSessionInfo,
	ToolApprovalDecision,
	WorkspaceValidation,
} from "./state.ts";
import type { Ack } from "./wire.ts";

// ---------------------------------------------------------------------------
// Request / response payloads
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
// Event map
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
	// --- lifecycle ---------------------------------------------------------
	"session:open": (request: OpenSessionRequest, ack: Ack<SessionOpened>) => void;
	"session:close": (sessionId: string, ack: Ack<null>) => void;
	/** Pull the current snapshot once (not a push). */
	"session:getState": (sessionId: string, ack: Ack<AgentStateSnapshot>) => void;

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
	"session:configure": (request: { sessionId: string; patch: AgentConfigPatch }, ack: Ack<AgentStateSnapshot>) => void;

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
// Request helpers (derive args / ack data from the event map — do not redefine)
// ---------------------------------------------------------------------------

export type ClientRequestName = keyof ClientToServerEvents;

/** Arguments for a client request, with the trailing `Ack` removed. */
export type ClientRequestArgs<K extends ClientRequestName> = Parameters<ClientToServerEvents[K]> extends [
	...infer Rest,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Ack is contravariant; any is required to match every event
	Ack<any>,
]
	? Rest
	: never;

/** Successful ack payload for a client request. */
export type ClientResponseData<K extends ClientRequestName> = Parameters<ClientToServerEvents[K]> extends [
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	...any[],
	Ack<infer T>,
]
	? T
	: never;
