/**
 * Pending tool approvals.
 *
 * Requests arrive by broadcast and are also present on every snapshot, so a
 * window that joins mid-prompt still sees what is waiting. Resolutions are
 * broadcast too, which is how a second window learns that someone else already
 * answered.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ToolApprovalRequest } from "@pine/protocol";

export interface ApprovalsState {
	pending: ToolApprovalRequest[];
	/** Approval ids with a decision in flight, to disable their buttons. */
	deciding: string[];
}

const initialState: ApprovalsState = { pending: [], deciding: [] };

export const approvalsSlice = createSlice({
	name: "approvals",
	initialState,
	reducers: {
		requested(state, action: PayloadAction<ToolApprovalRequest>) {
			if (state.pending.some((request) => request.approvalId === action.payload.approvalId)) return;
			state.pending.push(action.payload);
		},

		/** Authoritative list from a snapshot; wins over locally tracked state. */
		replaceAll(state, action: PayloadAction<ToolApprovalRequest[]>) {
			state.pending = action.payload;
			state.deciding = state.deciding.filter((id) =>
				action.payload.some((request) => request.approvalId === id),
			);
		},

		deciding(state, action: PayloadAction<string>) {
			if (!state.deciding.includes(action.payload)) state.deciding.push(action.payload);
		},

		resolved(state, action: PayloadAction<string>) {
			state.pending = state.pending.filter((request) => request.approvalId !== action.payload);
			state.deciding = state.deciding.filter((id) => id !== action.payload);
		},

		clear(state) {
			state.pending = [];
			state.deciding = [];
		},
	},
	selectors: {
		selectPendingApprovals: (state) => state.pending,
		selectDecidingApprovals: (state) => state.deciding,
	},
});

export const approvalsActions = approvalsSlice.actions;
export const { selectPendingApprovals, selectDecidingApprovals } = approvalsSlice.selectors;
