/**
 * The stored-session library and model diagnostics.
 *
 * Both are read straight from the sidecar and need no live session, which is
 * what lets a cold-started window list past conversations and validate a model
 * before anything is opened.
 */

import type { ModelInspection, StoredSessionInfo } from "@pine/protocol";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type LibraryScope = "all" | "workspace";

export interface LibraryState {
	sessions: StoredSessionInfo[];
	loading: boolean;
	scope: LibraryScope;
	/**
	 * Monotonic token for in-flight `listSessions` calls. A slow response whose
	 * epoch no longer matches is ignored so it cannot resurrect a session that
	 * was deleted (or otherwise changed) while the request was outstanding.
	 */
	listEpoch: number;
	inspection?: ModelInspection;
	inspecting: boolean;
	error?: string;
}

const initialState: LibraryState = { sessions: [], loading: false, scope: "all", listEpoch: 0, inspecting: false };

export const librarySlice = createSlice({
	name: "library",
	initialState,
	reducers: {
		loading(state) {
			state.loading = true;
			state.listEpoch += 1;
			delete state.error;
		},

		received(state, action: PayloadAction<{ sessions: StoredSessionInfo[]; epoch: number }>) {
			if (action.payload.epoch !== state.listEpoch) return;
			state.loading = false;
			state.sessions = action.payload.sessions;
		},

		failed(state, action: PayloadAction<{ error: string; epoch: number }>) {
			if (action.payload.epoch !== state.listEpoch) return;
			state.loading = false;
			state.error = action.payload.error;
		},

		setScope(state, action: PayloadAction<LibraryScope>) {
			state.scope = action.payload;
		},

		removed(state, action: PayloadAction<string>) {
			state.sessions = state.sessions.filter((session) => session.sessionId !== action.payload);
			// Invalidate in-flight listSessions so a stale response cannot resurrect
			// the row we just deleted.
			state.listEpoch += 1;
			state.loading = false;
		},

		inspecting(state) {
			state.inspecting = true;
			delete state.inspection;
		},

		inspected(state, action: PayloadAction<ModelInspection>) {
			state.inspecting = false;
			state.inspection = action.payload;
		},

		inspectFailed(state, action: PayloadAction<string>) {
			state.inspecting = false;
			state.error = action.payload;
		},
	},
	selectors: {
		selectStoredSessions: (state) => state.sessions,
		selectLibraryScope: (state) => state.scope,
		selectLibraryLoading: (state) => state.loading,
		selectInspection: (state) => state.inspection,
		selectInspecting: (state) => state.inspecting,
	},
});

export const libraryActions = librarySlice.actions;
export const { selectStoredSessions, selectLibraryScope, selectLibraryLoading, selectInspection, selectInspecting } =
	librarySlice.selectors;
