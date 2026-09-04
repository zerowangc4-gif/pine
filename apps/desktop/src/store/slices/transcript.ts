/**
 * The rendered conversation.
 *
 * Two inputs, deliberately kept separate:
 *
 *  - **Snapshots** replace the whole list. Used when a session opens, resumes,
 *    or has its transcript rewritten, where the server's copy is authoritative.
 *  - **Events** append incrementally. `message_update` rebuilds the in-flight
 *    assistant message so text streams in without re-rendering the history;
 *    `message_end` moves it into the list.
 *
 * Keys come from a counter in state rather than array indices, so inserting a
 * notice mid-stream never remounts the messages around it.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AgentEvent, AgentMessage, CompactionState, StopReason } from "@pine/protocol";

export type NoticeLevel = "info" | "warn" | "error";

export type TranscriptItem =
	| { kind: "message"; key: string; message: AgentMessage }
	| { kind: "notice"; key: string; level: NoticeLevel; text: string }
	| { kind: "compaction"; key: string; compaction: CompactionState; automatic: boolean }
	| { kind: "stop"; key: string; reason: StopReason }
	| { kind: "turnPrepared"; key: string; changes: string[] };

/** In-flight tool call, rebuilt from the three `tool_execution_*` events. */
export interface ToolProgress {
	toolCallId: string;
	toolName: string;
	args: unknown;
	partial?: unknown;
	done: boolean;
	isError?: boolean;
}

export interface TranscriptState {
	items: TranscriptItem[];
	/** Assistant message currently streaming, if any. */
	streaming?: AgentMessage;
	toolProgress: Record<string, ToolProgress>;
	/** Monotonic source for React keys. */
	nextKey: number;
}

const initialState: TranscriptState = { items: [], toolProgress: {}, nextKey: 1 };

/** Cap on retained items, so a long-running session cannot exhaust memory. */
const MAX_ITEMS = 2000;

function takeKey(state: TranscriptState, prefix: string): string {
	const key = `${prefix}-${state.nextKey}`;
	state.nextKey += 1;
	return key;
}

function push(state: TranscriptState, item: TranscriptItem): void {
	state.items.push(item);
	if (state.items.length > MAX_ITEMS) state.items.splice(0, state.items.length - MAX_ITEMS);
}

export const transcriptSlice = createSlice({
	name: "transcript",
	initialState,
	reducers: {
		/** Authoritative replacement from a snapshot. */
		replaceAll(state, action: PayloadAction<AgentMessage[]>) {
			state.items = action.payload.map((message) => ({
				kind: "message" as const,
				key: takeKey(state, "m"),
				message,
			}));
			delete state.streaming;
			state.toolProgress = {};
		},

		applyEvent(state, action: PayloadAction<AgentEvent>) {
			const event = action.payload;

			switch (event.type) {
				case "agent_start":
					// A fresh run starts with no tool activity carried over.
					state.toolProgress = {};
					return;

				case "message_start":
					// Assistant messages arrive empty and fill in through updates. User
					// and tool-result messages are already complete, so they are added
					// on `message_end` instead to avoid rendering them twice.
					if (event.message.role === "assistant") state.streaming = event.message;
					return;

				case "message_update":
					state.streaming = event.message;
					return;

				case "message_end":
					delete state.streaming;
					push(state, { kind: "message", key: takeKey(state, "m"), message: event.message });
					return;

				case "tool_execution_start":
					state.toolProgress[event.toolCallId] = {
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						args: event.args,
						done: false,
					};
					return;

				case "tool_execution_update": {
					const existing = state.toolProgress[event.toolCallId];
					state.toolProgress[event.toolCallId] = {
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						args: event.args,
						partial: event.partialResult,
						done: existing?.done ?? false,
					};
					return;
				}

				case "tool_execution_end": {
					const existing = state.toolProgress[event.toolCallId];
					state.toolProgress[event.toolCallId] = {
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						args: existing?.args,
						...(existing?.partial === undefined ? {} : { partial: existing.partial }),
						done: true,
						isError: event.isError,
					};
					return;
				}

				default:
					// `turn_start`, `turn_end` and `agent_end` change no rendered state;
					// the event log in the debug slice records them for inspection.
					return;
			}
		},

		notice(state, action: PayloadAction<{ level: NoticeLevel; text: string }>) {
			push(state, { kind: "notice", key: takeKey(state, "n"), ...action.payload });
		},

		stopped(state, action: PayloadAction<StopReason>) {
			push(state, { kind: "stop", key: takeKey(state, "s"), reason: action.payload });
		},

		compacted(state, action: PayloadAction<{ compaction: CompactionState; automatic: boolean }>) {
			push(state, { kind: "compaction", key: takeKey(state, "c"), ...action.payload });
		},

		turnPrepared(state, action: PayloadAction<string[]>) {
			push(state, { kind: "turnPrepared", key: takeKey(state, "t"), changes: action.payload });
		},

		/** Streaming stops on disconnect; a partial message must not look settled. */
		streamInterrupted(state) {
			delete state.streaming;
		},

		dismissNotices(state) {
			state.items = state.items.filter((item) => item.kind !== "notice");
		},

		clear(state) {
			state.items = [];
			state.toolProgress = {};
			delete state.streaming;
		},
	},
	selectors: {
		selectItems: (state) => state.items,
		selectStreaming: (state) => state.streaming,
		selectToolProgress: (state) => state.toolProgress,
	},
});

export const transcriptActions = transcriptSlice.actions;
export const { selectItems, selectStreaming, selectToolProgress } = transcriptSlice.selectors;
