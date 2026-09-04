/**
 * Working-directory actions.
 *
 * Two entry points that look similar but differ in an important way:
 *
 *  - `switchWorkspace` repoints a *live* session, keeping its transcript.
 *  - `setInitialWorkspace` only edits the draft, for when no session exists yet.
 *
 * The picker calls whichever applies, so choosing a directory behaves sensibly
 * both before and during a conversation.
 */

import { request } from "../../socket/client.ts";
import { configActions } from "../slices/config.ts";
import { sessionActions } from "../slices/session.ts";
import { transcriptActions } from "../slices/transcript.ts";
import { workspaceActions } from "../slices/workspace.ts";
import { adoptSnapshot, reportError, type AppThunk } from "./shared.ts";

/** List one level of the tree. Empty path lists the sidecar's own directory. */
export function browseDirectory(path?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		dispatch(workspaceActions.browsing());
		try {
			const listing = await request("workspace:browse", {
				...(path ? { path } : {}),
				includeHidden: getState().workspace.showHidden,
			});
			dispatch(workspaceActions.listingReceived(listing));
		} catch (error) {
			dispatch(workspaceActions.browseFailed(String(error)));
		}
	};
}

/** Check a typed path without committing to it, to drive inline feedback. */
export function validateWorkspacePath(path: string): AppThunk<Promise<void>> {
	return async (dispatch) => {
		try {
			dispatch(workspaceActions.validationReceived(await request("workspace:validate", path)));
		} catch (error) {
			dispatch(workspaceActions.browseFailed(String(error)));
		}
	};
}

export function loadRecentWorkspaces(): AppThunk<Promise<void>> {
	return async (dispatch) => {
		try {
			dispatch(workspaceActions.recentReceived(await request("workspace:recent")));
		} catch {
			// A missing session history is not worth reporting; the picker just
			// shows no shortcuts.
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
			dispatch(setInitialWorkspace(path));
			dispatch(workspaceActions.switched());
			return;
		}

		dispatch(workspaceActions.switching());
		try {
			const result = await request("workspace:switch", { sessionId, path });

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

/** Record the directory a future session should start in. */
export function setInitialWorkspace(path: string): AppThunk {
	return (dispatch) => {
		dispatch(configActions.patchDraft({ cwd: path }));
	};
}
