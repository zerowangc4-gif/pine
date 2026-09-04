/**
 * Session state the runtime publishes to clients.
 *
 * `AgentStateSnapshot` mirrors `Agent.state` plus the bookkeeping the runtime
 * owns around it (usage totals, queues, compaction, persistence). It is the
 * single source of truth: the UI renders streaming deltas from events, but
 * every settled value comes from a snapshot.
 */

import type { AgentConfig, ThinkingLevel, ToolName } from "./config.ts";
import type { AgentMessage } from "./messages.ts";

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

export interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning: number;
	totalTokens: number;
	cost: number;
	requests: number;
}

export const EMPTY_USAGE_TOTALS: UsageTotals = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	reasoning: 0,
	totalTokens: 0,
	cost: 0,
	requests: 0,
};

// ---------------------------------------------------------------------------
// Queues, compaction, approvals
// ---------------------------------------------------------------------------

export type QueueName = "steering" | "followUp";

export interface QueuedMessagePreview {
	id: string;
	queue: QueueName;
	text: string;
	images: number;
	enqueuedAt: number;
}

export interface CompactionState {
	generation: number;
	summary: string;
	tokensBefore: number;
	/** How many leading transcript messages the summary stands in for. */
	foldedMessages: number;
	createdAt: number;
}

export interface ToolApprovalRequest {
	approvalId: string;
	toolCallId: string;
	toolName: string;
	args: unknown;
	/** Rendered command for bash, path for the file tools. */
	summary: string;
	readOnly: boolean;
	requestedAt: number;
}

export type ToolApprovalDecision =
	| { kind: "allow" }
	| { kind: "allow-always" }
	| { kind: "block"; reason?: string }
	| { kind: "block-and-stop"; reason?: string };

/** Why a run ended before the model ran out of tool calls. */
export type StopReason =
	| { kind: "max-turns"; turns: number }
	| { kind: "context-limit"; contextTokens: number; contextWindow: number }
	| { kind: "user-requested" }
	| { kind: "tool-terminate" };

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface AgentStateSnapshot {
	sessionId: string;
	config: AgentConfig;

	// Mirrors Agent.state.
	systemPrompt: string;
	thinkingLevel: ThinkingLevel;
	toolNames: string[];
	messages: AgentMessage[];
	isStreaming: boolean;
	streamingMessage?: AgentMessage;
	pendingToolCalls: string[];
	errorMessage?: string;

	// Runtime-owned.
	/** Resolved absolute workspace root, after `~` expansion. */
	workspace: string;
	supportedThinkingLevels: ThinkingLevel[];
	hasQueuedMessages: boolean;
	queued: QueuedMessagePreview[];
	turnCount: number;
	usage: UsageTotals;
	contextTokens: number;
	contextWindow: number;
	compaction?: CompactionState;
	/** True between `abort()` and run settlement. */
	aborting: boolean;
	/** True when a graceful stop was requested for the next turn boundary. */
	stopRequested: boolean;
	transcriptPath?: string;
	pendingApprovals: ToolApprovalRequest[];
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface SkillInfo {
	name: string;
	description: string;
	content: string;
	filePath: string;
	disableModelInvocation?: boolean;
}

export interface PromptTemplateInfo {
	name: string;
	description?: string;
	content: string;
}

export interface ToolDescriptor {
	name: ToolName;
	label: string;
	description: string;
	enabled: boolean;
	readOnly: boolean;
}

export interface ResourceDiagnostic {
	source: "skills" | "promptTemplates";
	message: string;
	path: string;
}

export interface SessionResources {
	skills: SkillInfo[];
	promptTemplates: PromptTemplateInfo[];
	tools: ToolDescriptor[];
	diagnostics: ResourceDiagnostic[];
}

// ---------------------------------------------------------------------------
// Stored sessions
// ---------------------------------------------------------------------------

export interface StoredSessionInfo {
	sessionId: string;
	path: string;
	cwd: string;
	createdAt: number;
	modifiedAt: number;
	label?: string;
	messageCount: number;
	totalTokens: number;
	costTotal: number;
}

// ---------------------------------------------------------------------------
// Workspace selection
// ---------------------------------------------------------------------------

export interface DirectoryEntry {
	name: string;
	path: string;
	/** Directories the user is unlikely to want as a workspace root. */
	hidden: boolean;
}

/** One level of the filesystem, for the workspace picker. */
export interface DirectoryListing {
	path: string;
	/** Absolute parent path, or undefined at a filesystem root. */
	parent?: string;
	directories: DirectoryEntry[];
	/** File count in this directory, as a hint that it holds a real project. */
	fileCount: number;
}

export interface WorkspaceValidation {
	/** Absolute path after `~` expansion and normalization. */
	path: string;
	exists: boolean;
	isDirectory: boolean;
	writable: boolean;
	/** Set when the path cannot be used, ready to show to the user. */
	problem?: string;
}

export interface ModelInspection {
	supportedThinkingLevels: ThinkingLevel[];
	/** Where the credential came from: config, an environment variable, or none. */
	authSource?: string;
	hasCredential: boolean;
}
