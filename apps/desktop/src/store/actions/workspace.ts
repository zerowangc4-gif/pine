/**
 * Workspace thunks: call `socket/send` (1:1 contract), then update Redux.
 */

import * as send from "../../socket/send.ts";
import { configActions } from "../slices/config.ts";
import { sessionActions } from "../slices/session.ts";
import { transcriptActions } from "../slices/transcript.ts";
import { workspaceActions } from "../slices/workspace.ts";
import { type AppThunk, adoptSnapshot, reportError } from "./shared.ts";

export function browseWorkspace(path?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		dispatch(workspaceActions.browsing());
		try {
			const listing = await send.browseWorkspace(path, getState().workspace.showHidden);
			dispatch(workspaceActions.listingReceived(listing));
		} catch (error) {
			dispatch(workspaceActions.browseFailed(String(error)));
		}
	};
}

export function validateWorkspace(path: string): AppThunk<Promise<void>> {
	return async (dispatch) => {
		try {
			dispatch(workspaceActions.validationReceived(await send.validateWorkspace(path)));
		} catch (error) {
			dispatch(workspaceActions.browseFailed(String(error)));
		}
	};
}

export function recentWorkspaces(): AppThunk<Promise<void>> {
	return async (dispatch) => {
		try {
			dispatch(workspaceActions.recentReceived(await send.recentWorkspaces()));
		} catch {
			// Missing history is fine; picker just shows no shortcuts.
		}
	};
}

/**
 * Repoint the live session, or the draft if there is no session yet.
 *
 * The server validates before switching, so an invalid path leaves the session
 * untouched and comes back with a message to show.
 */
export function switchWorkspace(path: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;

		if (!sessionId) {
			dispatch(configActions.patchDraft({ cwd: path }));
			dispatch(workspaceActions.switched());
			return;
		}

		dispatch(workspaceActions.switching());
		try {
			const result = await send.switchWorkspace(sessionId, path);

			if (!result.validation.exists || !result.validation.isDirectory) {
				dispatch(workspaceActions.switchFailed(result.validation.problem ?? "invalid"));
				return;
			}

			adoptSnapshot(dispatch, result.state);
			dispatch(sessionActions.resourcesReceived(result.resources));
			dispatch(workspaceActions.switched());

			if (!result.validation.writable) {
				dispatch(transcriptActions.notice({ level: "warn", text: result.validation.problem ?? "" }));
			}
		} catch (error) {
			dispatch(workspaceActions.switchFailed(String(error)));
			reportError(dispatch, error);
		}
	};
}
