/**
 * Thunk plumbing shared by every action module.
 *
 * Plain thunks are used rather than `createAsyncThunk`: the slices already
 * model their own loading and error state explicitly, so the generated
 * pending/fulfilled/rejected triplets would be boilerplate with no reader.
 */

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { AgentStateSnapshot } from "@pine/protocol";
import type { AppDispatch, RootState } from "../index.ts";
import { approvalsActions } from "../slices/approvals.ts";
import { configActions } from "../slices/config.ts";
import { sessionActions } from "../slices/session.ts";
import { transcriptActions } from "../slices/transcript.ts";

export type AppThunk<Result = void> = ThunkAction<Result, RootState, undefined, UnknownAction>;

export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Surface a failure in the transcript, where the user is already looking. */
export function reportError(dispatch: AppDispatch, error: unknown): void {
	dispatch(transcriptActions.notice({ level: "error", text: errorText(error) }));
}

/**
 * Apply an authoritative snapshot to every slice that derives from it.
 *
 * `rewriteTranscript` is for operations that changed the message list itself
 * (reset, truncate, replace, compact). Without it the transcript keeps its
 * streamed items, which is what makes an ordinary configuration change cheap.
 */
export function adoptSnapshot(
	dispatch: AppDispatch,
	snapshot: AgentStateSnapshot,
	options: { rewriteTranscript?: boolean } = {},
): void {
	dispatch(sessionActions.snapshotReceived(snapshot));
	dispatch(approvalsActions.replaceAll(snapshot.pendingApprovals));
	dispatch(configActions.serverConfirmed(snapshot.config));
	if (options.rewriteTranscript) dispatch(transcriptActions.replaceAll(snapshot.messages));
}
