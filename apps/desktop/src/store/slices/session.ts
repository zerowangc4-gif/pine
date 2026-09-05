/**
 * The live session: its id, the last authoritative snapshot, and its resources.
 *
 * The snapshot is the single source of truth for settled values (usage, queue,
 * compaction, workspace). Streaming text is rendered from events by the
 * transcript slice, but anything durable comes from here.
 */

import type { AgentStateSnapshot, SessionResources } from "@pine/protocol";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface SessionState {
	sessionId?: string;
	snapshot?: AgentStateSnapshot;
	resources?: SessionResources;
	/** True while `session:open` is in flight, to disable the start button. */
	opening: boolean;
	/** True between starting a run and its `session:runEnd`. */
	running: boolean;
	error?: string;
}

const initialState: SessionState = { opening: false, running: false };

export const sessionSlice = createSlice({
	name: "session",
	initialState,
	reducers: {
		opening(state) {
			state.opening = true;
			delete state.error;
		},

		opened(state, action: PayloadAction<{ snapshot: AgentStateSnapshot; resources: SessionResources }>) {
			state.opening = false;
			state.sessionId = action.payload.snapshot.sessionId;
			state.snapshot = action.payload.snapshot;
			state.resources = action.payload.resources;
			state.running = action.payload.snapshot.isStreaming;
			delete state.error;
		},

		openFailed(state, action: PayloadAction<string>) {
			state.opening = false;
			state.error = action.payload;
		},

		/** Applied from request acks and `session:state` pushes. */
		snapshotReceived(state, action: PayloadAction<AgentStateSnapshot>) {
			// Ignore snapshots from a session this window has already left.
			if (state.sessionId && action.payload.sessionId !== state.sessionId) return;
			state.snapshot = action.payload;
			state.running = action.payload.isStreaming;
		},

		resourcesReceived(state, action: PayloadAction<SessionResources>) {
			state.resources = action.payload;
		},

		runStarted(state) {
			state.running = true;
		},

		runEnded(state) {
			state.running = false;
		},

		closed(state, action: PayloadAction<string>) {
			if (state.sessionId !== action.payload) return;
			delete state.sessionId;
			delete state.snapshot;
			delete state.resources;
			state.running = false;
		},
	},
	selectors: {
		selectSessionId: (state) => state.sessionId,
		selectSnapshot: (state) => state.snapshot,
		selectResources: (state) => state.resources,
		selectIsRunning: (state) => state.running || state.snapshot?.isStreaming === true,
		/** Resolved workspace root, or empty before the first session. */
		selectWorkspace: (state) => state.snapshot?.workspace ?? "",
	},
});

export const sessionActions = sessionSlice.actions;
export const { selectSessionId, selectSnapshot, selectResources, selectIsRunning, selectWorkspace } =
	sessionSlice.selectors;
