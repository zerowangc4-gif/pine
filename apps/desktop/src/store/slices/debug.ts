/**
 * Diagnostics: the raw event stream and captured provider traffic.
 *
 * Both are ring buffers. They exist to answer "what did the agent actually
 * do", so they record verbatim and drop the oldest entries rather than
 * summarizing.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AgentEventType } from "@pine/protocol";

export interface EventLogEntry {
	key: string;
	seq: number;
	type: AgentEventType;
	at: number;
}

export interface PayloadEntry {
	key: string;
	seq: number;
	direction: "request" | "response";
	body: unknown;
	at: number;
}

export interface DebugState {
	events: EventLogEntry[];
	payloads: PayloadEntry[];
	nextKey: number;
}

const MAX_EVENTS = 500;
const MAX_PAYLOADS = 200;

const initialState: DebugState = { events: [], payloads: [], nextKey: 1 };

export const debugSlice = createSlice({
	name: "debug",
	initialState,
	reducers: {
		eventObserved(state, action: PayloadAction<{ seq: number; type: AgentEventType }>) {
			state.events.push({ key: `e-${state.nextKey}`, at: Date.now(), ...action.payload });
			state.nextKey += 1;
			if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
		},

		payloadObserved(state, action: PayloadAction<{ seq: number; direction: PayloadEntry["direction"]; body: unknown }>) {
			state.payloads.push({ key: `p-${state.nextKey}`, at: Date.now(), ...action.payload });
			state.nextKey += 1;
			if (state.payloads.length > MAX_PAYLOADS) state.payloads.splice(0, state.payloads.length - MAX_PAYLOADS);
		},

		clear(state) {
			state.events = [];
			state.payloads = [];
		},
	},
	selectors: {
		selectEventLog: (state) => state.events,
		selectPayloads: (state) => state.payloads,
	},
});

export const debugActions = debugSlice.actions;
export const { selectEventLog, selectPayloads } = debugSlice.selectors;
