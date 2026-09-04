/**
 * Wire mirror of `AgentEvent`.
 *
 * Every variant the agent loop emits is represented, and the runtime forwards
 * them verbatim so the UI renders real lifecycle data rather than a summary.
 */

import type { AgentMessage, ToolResultMessage } from "./messages.ts";

export type AgentEvent =
	// Run lifecycle.
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[] }
	// One turn is a single assistant response plus the tool calls it triggered.
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	// Message lifecycle, emitted for user, assistant and tool-result messages.
	| { type: "message_start"; message: AgentMessage }
	/**
	 * Assistant messages only, once per streamed delta. `assistantMessageEvent`
	 * carries the provider-level delta; the UI renders from `message` instead,
	 * so it stays opaque here rather than duplicating the provider event union.
	 */
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: unknown }
	| { type: "message_end"; message: AgentMessage }
	// Tool execution lifecycle.
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

export type AgentEventType = AgentEvent["type"];

/** Every event type, in the order a healthy run emits them for the first time. */
export const AGENT_EVENT_TYPES: AgentEventType[] = [
	"agent_start",
	"turn_start",
	"message_start",
	"message_update",
	"message_end",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_end",
	"turn_end",
	"agent_end",
];
