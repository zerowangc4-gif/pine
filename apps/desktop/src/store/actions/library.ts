/**
 * Library thunks: call `socket/send` (1:1 contract), then update Redux.
 */

import * as send from "../../socket/send.ts";
import { libraryActions } from "../slices/library.ts";
import { closeSession, openSession } from "./session.ts";
import { type AppThunk, reportError } from "./shared.ts";

export function listSessions(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		dispatch(libraryActions.loading());
		const epoch = getState().library.listEpoch;
		try {
			const state = getState();
			const cwd = state.library.scope === "workspace" ? state.session.snapshot?.workspace : undefined;
			const sessions = await send.listSessions(cwd);
			dispatch(libraryActions.received({ sessions, epoch }));
		} catch (error) {
			dispatch(libraryActions.failed({ error: String(error), epoch }));
		}
	};
}

export function deleteSession(sessionId: string): AppThunk<Promise<void>> {
	return async (dispatch) => {
		try {
			await send.deleteSession(sessionId);
			dispatch(libraryActions.removed(sessionId));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Leave the current session and reopen the stored one from its transcript. */
export function resumeStoredSession(sessionId: string): AppThunk<Promise<void>> {
	return async (dispatch) => {
		await dispatch(closeSession());
		await dispatch(openSession(sessionId));
	};
}

export function inspectModel(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const { model, apiKey } = getState().config.draft;
		dispatch(libraryActions.inspecting());
		try {
			dispatch(libraryActions.inspected(await send.inspectModel(model, apiKey)));
		} catch (error) {
			dispatch(libraryActions.inspectFailed(String(error)));
			reportError(dispatch, error);
		}
	};
}
