/**
 * The Redux store.
 *
 * Slices are pure reducers with no knowledge of the transport; thunks in
 * `store/actions` own every socket call. That split is what keeps the socket
 * bridge (`socket/bridge.ts`) a thin translation layer: a broadcast arrives, a
 * slice action is dispatched, and nothing else needs to know.
 */

import { configureStore } from "@reduxjs/toolkit";
import { approvalsSlice } from "./slices/approvals.ts";
import { configSlice } from "./slices/config.ts";
import { connectionSlice } from "./slices/connection.ts";
import { debugSlice } from "./slices/debug.ts";
import { librarySlice } from "./slices/library.ts";
import { sessionSlice } from "./slices/session.ts";
import { transcriptSlice } from "./slices/transcript.ts";
import { uiSlice } from "./slices/ui.ts";
import { workspaceSlice } from "./slices/workspace.ts";

export const store = configureStore({
	reducer: {
		[connectionSlice.reducerPath]: connectionSlice.reducer,
		[sessionSlice.reducerPath]: sessionSlice.reducer,
		[transcriptSlice.reducerPath]: transcriptSlice.reducer,
		[configSlice.reducerPath]: configSlice.reducer,
		[approvalsSlice.reducerPath]: approvalsSlice.reducer,
		[workspaceSlice.reducerPath]: workspaceSlice.reducer,
		[librarySlice.reducerPath]: librarySlice.reducer,
		[debugSlice.reducerPath]: debugSlice.reducer,
		[uiSlice.reducerPath]: uiSlice.reducer,
	},
	middleware: (getDefault) =>
		getDefault({
			// Transcripts and captured provider payloads are large and arrive
			// constantly; deep-freezing them on every action is the single biggest
			// cost in a streaming run, and the reducers never mutate them anyway.
			serializableCheck: false,
			immutableCheck: false,
		}),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
