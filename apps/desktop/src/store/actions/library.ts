/**
 * Stored-session and model-diagnostic actions.
 *
 * These work without a live session, which is what lets a freshly opened window
 * show past conversations and verify a model before committing to it.
 */

import { request } from "../../socket/client.ts";
import { libraryActions } from "../slices/library.ts";
import { reportError, type AppThunk } from "./shared.ts";
import { closeSession, openSession } from "./session.ts";

export function loadStoredSessions(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const state = getState();
		dispatch(libraryActions.loading());
		try {
			const cwd = state.library.scope === "workspace" ? state.session.snapshot?.workspace : undefined;
			dispatch(libraryActions.received(await request("sessions:list", cwd ? { cwd } : {})));
		} catch (error) {
			dispatch(libraryActions.failed(String(error)));
		}
	};
}

export function deleteStoredSession(sessionId: string): AppThunk<Promise<void>> {
	return async (dispatch) => {
		try {
			await request("sessions:delete", sessionId);
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

/**
 * Probe the drafted model.
 *
 * Reports which thinking levels it accepts and whether a credential can be
 * found, so a misconfiguration shows up here instead of as a failed first turn.
 */
export function inspectModel(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const { model, apiKey } = getState().config.draft;
		dispatch(libraryActions.inspecting());
		try {
			dispatch(libraryActions.inspected(await request("model:inspect", { model, apiKey })));
		} catch (error) {
			dispatch(libraryActions.inspectFailed(String(error)));
			reportError(dispatch, error);
		}
	};
}
