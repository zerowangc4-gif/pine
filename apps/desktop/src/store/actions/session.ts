/**
 * Session thunks: call `socket/send` (1:1 contract), then update Redux.
 */

import type { AgentConfigPatch, AgentMessage, ImageContent, ToolApprovalDecision } from "@pine/protocol";
import * as send from "../../socket/send.ts";
import { approvalsActions } from "../slices/approvals.ts";
import { configActions } from "../slices/config.ts";
import { sessionActions } from "../slices/session.ts";
import { transcriptActions } from "../slices/transcript.ts";
import { type AppThunk, adoptSnapshot, reportError } from "./shared.ts";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function openSession(resumeSessionId?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		dispatch(sessionActions.opening());
		try {
			const config = getState().config.draft;
			const result = await send.openSession({
				config,
				...(resumeSessionId ? { resumeSessionId } : {}),
			});

			dispatch(sessionActions.opened({ snapshot: result.state, resources: result.resources }));
			dispatch(transcriptActions.replaceAll(result.state.messages));
			dispatch(approvalsActions.replaceAll(result.state.pendingApprovals));
			dispatch(configActions.serverConfirmed(result.state.config));

			if (result.reattached) {
				dispatch(transcriptActions.notice({ level: "info", text: "reattached" }));
			}
		} catch (error) {
			dispatch(sessionActions.openFailed(String(error)));
			reportError(dispatch, error);
		}
	};
}

export function closeSession(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			await send.closeSession(sessionId);
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Close whatever is open, then start fresh with the current draft. */
export function startNewSession(): AppThunk<Promise<void>> {
	return async (dispatch) => {
		await dispatch(closeSession());
		await dispatch(openSession());
	};
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export function prompt(text: string, images: ImageContent[] = []): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			dispatch(sessionActions.runStarted());
			const snapshot = await send.prompt({
				sessionId,
				text,
				...(images.length > 0 ? { images } : {}),
			});
			adoptSnapshot(dispatch, snapshot);
		} catch (error) {
			dispatch(sessionActions.runEnded());
			reportError(dispatch, error);
		}
	};
}

export function continueRun(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			dispatch(sessionActions.runStarted());
			adoptSnapshot(dispatch, await send.continueRun(sessionId));
		} catch (error) {
			dispatch(sessionActions.runEnded());
			reportError(dispatch, error);
		}
	};
}

export function steer(text: string, images: ImageContent[] = []): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			await send.steer(sessionId, text, images);
			adoptSnapshot(dispatch, await send.getSessionState(sessionId));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function followUp(text: string, images: ImageContent[] = []): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			await send.followUp(sessionId, text, images);
			adoptSnapshot(dispatch, await send.getSessionState(sessionId));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function clearQueue(queue: "steering" | "followUp" | "all"): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.clearQueue(sessionId, queue));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

export function abort(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.abort(sessionId));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function requestStop(cancel = false): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.requestStop(sessionId, cancel));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export function reset(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.reset(sessionId), { rewriteTranscript: true });
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function truncate(index: number): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.truncate(sessionId, index), { rewriteTranscript: true });
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function setMessages(messages: AgentMessage[]): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.setMessages(sessionId, messages), {
				rewriteTranscript: true,
			});
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function compact(customInstructions?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			const result = await send.compact(sessionId, customInstructions);
			adoptSnapshot(dispatch, result.state);
			if (!result.compaction) {
				dispatch(transcriptActions.notice({ level: "info", text: "nothing-to-compact" }));
			}
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Push the whole draft to the session.
 *
 * `cwd` is deliberately excluded: the working directory is owned by the
 * workspace picker, and including it here would let a stale draft silently
 * undo a directory the user just switched to.
 */
export function applyConfig(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const state = getState();
		const sessionId = state.session.sessionId;
		const { cwd: _ignored, ...patch } = state.config.draft;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.configure(sessionId, patch));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Apply one field immediately; used by the toggles that should feel instant. */
export function configureNow(patch: AgentConfigPatch): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		dispatch(configActions.patchDraft(patch));
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await send.configure(sessionId, patch));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function runSkill(name: string, additionalInstructions?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			dispatch(sessionActions.runStarted());
			adoptSnapshot(dispatch, await send.runSkill(sessionId, name, additionalInstructions));
		} catch (error) {
			dispatch(sessionActions.runEnded());
			reportError(dispatch, error);
		}
	};
}

export function runTemplate(name: string, args: string[]): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			dispatch(sessionActions.runStarted());
			adoptSnapshot(dispatch, await send.runTemplate(sessionId, name, args));
		} catch (error) {
			dispatch(sessionActions.runEnded());
			reportError(dispatch, error);
		}
	};
}

export function reloadResources(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			dispatch(sessionActions.resourcesReceived(await send.reloadResources(sessionId)));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function approveTool(approvalId: string, decision: ToolApprovalDecision): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		dispatch(approvalsActions.deciding(approvalId));
		try {
			adoptSnapshot(dispatch, await send.approveTool(sessionId, approvalId, decision));
		} catch (error) {
			dispatch(approvalsActions.resolved(approvalId));
			reportError(dispatch, error);
		}
	};
}
