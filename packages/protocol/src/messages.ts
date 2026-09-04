/**
 * Wire mirror of the agent's message model.
 *
 * These are structural copies of the `@pine/agent` / `@pine/ai` types rather
 * than re-exports. The protocol is a JSON contract, and keeping it dependency
 * free means the browser bundle never pulls provider implementations into its
 * type program. `packages/runtime/src/conformance.ts` asserts at compile time
 * that the library types still satisfy these shapes, so upstream drift breaks
 * the build instead of leaking through at runtime.
 */

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface TextContent {
	type: "text";
	text: string;
	textSignature?: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
	/** Provider redacted the reasoning; the opaque payload stays in the signature. */
	redacted?: boolean;
}

export interface ImageContent {
	type: "image";
	/** Base64 payload without a data-URL prefix. */
	data: string;
	mimeType: string;
}

export interface ToolCallContent {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	thoughtSignature?: string;
	namespace?: string;
}

export type UserContent = TextContent | ImageContent;
export type AssistantContent = TextContent | ThinkingContent | ToolCallContent;
export type ToolResultContent = TextContent | ImageContent;

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageCost {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
}

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cacheWrite1h?: number;
	/** Subset of `output`, when the provider reports a reasoning breakdown. */
	reasoning?: number;
	totalTokens: number;
	cost: UsageCost;
}

export type MessageStopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface UserMessage {
	role: "user";
	content: string | UserContent[];
	timestamp: number;
}

export interface AssistantMessage {
	role: "assistant";
	content: AssistantContent[];
	api: string;
	provider: string;
	model: string;
	responseModel?: string;
	responseId?: string;
	diagnostics?: unknown[];
	usage: Usage;
	stopReason: MessageStopReason;
	deferred?: unknown;
	errorMessage?: string;
	rawStopReason?: string;
	endTurn?: boolean;
	timestamp: number;
}

export interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: ToolResultContent[];
	details?: unknown;
	usage?: Usage;
	addedToolNames?: string[];
	isError: boolean;
	timestamp: number;
}

/** Shell output recorded outside the model loop. */
export interface BashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
	timestamp: number;
	excludeFromContext?: boolean;
}

/** Application-defined message; `display` gates whether the UI renders it. */
export interface CustomMessage {
	role: "custom";
	customType: string;
	content: string | UserContent[];
	display: boolean;
	details?: unknown;
	timestamp: number;
}

export interface BranchSummaryMessage {
	role: "branchSummary";
	summary: string;
	fromId: string;
	timestamp: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	tokensBefore: number;
	timestamp: number;
}

export type AgentMessage =
	| UserMessage
	| AssistantMessage
	| ToolResultMessage
	| BashExecutionMessage
	| CustomMessage
	| BranchSummaryMessage
	| CompactionSummaryMessage;

export type AgentMessageRole = AgentMessage["role"];

// ---------------------------------------------------------------------------
// Helpers shared by both sides of the wire
// ---------------------------------------------------------------------------

function textOf(content: string | { type: string; text?: string }[]): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("");
}

/** Plain-text projection of a message, for previews, titles and search. */
export function messageText(message: AgentMessage): string {
	switch (message.role) {
		case "user":
		case "custom":
			return textOf(message.content);
		case "assistant":
			return textOf(message.content);
		case "toolResult":
			return message.content
				.filter((part): part is TextContent => part.type === "text")
				.map((part) => part.text)
				.join("\n");
		case "compactionSummary":
		case "branchSummary":
			return message.summary;
		case "bashExecution":
			return `${message.command}\n${message.output}`;
	}
}

/** Tool calls requested by an assistant message. */
export function toolCallsOf(message: AgentMessage): ToolCallContent[] {
	if (message.role !== "assistant") return [];
	return message.content.filter((part): part is ToolCallContent => part.type === "toolCall");
}

/** True when a message contributes nothing the user would want to see. */
export function isDisplayable(message: AgentMessage): boolean {
	if (message.role === "custom") return message.display;
	return true;
}
