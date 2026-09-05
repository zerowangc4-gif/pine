/**
 * Socket connection state.
 *
 * `readyEpoch` is the important field: it increments on every `ready` frame,
 * which is the signal the app uses to re-establish its session after a
 * reconnect or a sidecar restart.
 */

import { PROTOCOL_VERSION, type RuntimeInfo } from "@pine/protocol";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ConnectionState {
	status: ConnectionStatus;
	runtime?: RuntimeInfo;
	/** True when Socket.IO restored the previous session rather than starting fresh. */
	recovered: boolean;
	readyEpoch: number;
	/** Last transport-level failure, shown while disconnected. */
	error?: string;
	attempts: number;
}

const initialState: ConnectionState = {
	status: "connecting",
	recovered: false,
	readyEpoch: 0,
	attempts: 0,
};

export const connectionSlice = createSlice({
	name: "connection",
	initialState,
	reducers: {
		connecting(state) {
			state.status = "connecting";
		},

		connected(state, action: PayloadAction<{ recovered: boolean }>) {
			state.status = "connected";
			state.recovered = action.payload.recovered;
			delete state.error;
			state.attempts = 0;
		},

		disconnected(state, action: PayloadAction<string | undefined>) {
			state.status = "disconnected";
			state.recovered = false;
			if (action.payload) state.error = action.payload;
		},

		connectFailed(state, action: PayloadAction<string>) {
			state.status = "disconnected";
			state.error = action.payload;
			state.attempts += 1;
		},

		ready(state, action: PayloadAction<RuntimeInfo>) {
			state.status = "connected";
			state.runtime = action.payload;
			state.readyEpoch += 1;
		},
	},
	selectors: {
		/** A protocol mismatch means the bundled sidecar is stale. */
		selectProtocolMismatch: (state) =>
			state.runtime && state.runtime.protocolVersion !== PROTOCOL_VERSION
				? { server: state.runtime.protocolVersion, client: PROTOCOL_VERSION }
				: undefined,
	},
});

export const connectionActions = connectionSlice.actions;
export const { selectProtocolMismatch } = connectionSlice.selectors;
