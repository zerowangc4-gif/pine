/**
 * The stored-session library and model diagnostics.
 *
 * Both are read straight from the sidecar and need no live session, which is
 * what lets a cold-started window list past conversations and validate a model
 * before anything is opened.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ModelInspection, StoredSessionInfo } from "@pine/protocol";

export type LibraryScope = "all" | "workspace";

export interface LibraryState {
	sessions: StoredSessionInfo[];
	loading: boolean;
	scope: LibraryScope;
	inspection?: ModelInspection;
	inspecting: boolean;
	error?: string;
}

const initialState: LibraryState = { sessions: [], loading: false, scope: "all", inspecting: false };

export const librarySlice = createSlice({
	name: "library",
	initialState,
	reducers: {
		loading(state) {
			state.loading = true;
			delete state.error;
		},

		received(state, action: PayloadAction<StoredSessionInfo[]>) {
			state.loading = false;
			state.sessions = action.payload;
		},

		failed(state, action: PayloadAction<string>) {
			state.loading = false;
			state.error = action.payload;
		},

		setScope(state, action: PayloadAction<LibraryScope>) {
			state.scope = action.payload;
		},

		removed(state, action: PayloadAction<string>) {
			state.sessions = state.sessions.filter((session) => session.sessionId !== action.payload);
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
export const {
	selectStoredSessions,
	selectLibraryScope,
	selectLibraryLoading,
	selectInspection,
	selectInspecting,
} = librarySlice.selectors;
