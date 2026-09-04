/**
 * Every operation that drives a session.
 *
 * Each thunk is the same three steps: send a request, adopt the snapshot it
 * acknowledges, report a failure in the transcript. The interesting decisions
 * are commented at the point they are made.
 */

import type { AgentConfigPatch, AgentMessage, ImageContent, ToolApprovalDecision } from "@pine/protocol";
import { request } from "../../socket/client.ts";
import { approvalsActions } from "../slices/approvals.ts";
import { configActions } from "../slices/config.ts";
import { sessionActions } from "../slices/session.ts";
import { transcriptActions } from "../slices/transcript.ts";
import { adoptSnapshot, reportError, type AppThunk } from "./shared.ts";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Open a session, or adopt one that is already running.
 *
 * `resumeSessionId` covers two distinct cases the server disambiguates for us:
 * reattaching to a live session after a window reload, and resuming a finished
 * one from its stored transcript.
 */
export function openSession(resumeSessionId?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		dispatch(sessionActions.opening());
		try {
			const config = getState().config.draft;
			const result = await request("session:open", {
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
			await request("session:close", sessionId);
			// The `session:closed` broadcast clears the slices, so nothing to do here.
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

export function promptAgent(text: string, images: ImageContent[] = []): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			// Marked as running before the ack so the composer switches to its
			// steering affordances immediately rather than after a round trip.
			dispatch(sessionActions.runStarted());
			const snapshot = await request("session:prompt", {
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

/** Another turn with no new user message; useful after a stop or an error. */
export function continueAgent(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			dispatch(sessionActions.runStarted());
			adoptSnapshot(dispatch, await request("session:continue", sessionId));
		} catch (error) {
			dispatch(sessionActions.runEnded());
			reportError(dispatch, error);
		}
	};
}

/** Inject before the agent's next response. */
export function steerAgent(text: string, images: ImageContent[] = []): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			await request("session:steer", { sessionId, text, ...(images.length > 0 ? { images } : {}) });
			adoptSnapshot(dispatch, await request("session:state", sessionId));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Run once the agent would otherwise have stopped. */
export function followUpAgent(text: string, images: ImageContent[] = []): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			await request("session:followUp", { sessionId, text, ...(images.length > 0 ? { images } : {}) });
			adoptSnapshot(dispatch, await request("session:state", sessionId));
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
			adoptSnapshot(dispatch, await request("session:clearQueue", { sessionId, queue }));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/** Hard stop: cancels the in-flight request and any running tool. */
export function abortRun(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await request("session:abort", sessionId));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Graceful stop: finish the current turn, then end the run. */
export function requestStop(cancel = false): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await request("session:requestStop", { sessionId, cancel }));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export function resetTranscript(): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await request("session:reset", sessionId), { rewriteTranscript: true });
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Rewind: drop everything from `index` onward and continue from there. */
export function truncateTranscript(index: number): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await request("session:truncate", { sessionId, index }), { rewriteTranscript: true });
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

/** Replace the whole transcript with an explicit message list. */
export function setTranscriptMessages(messages: AgentMessage[]): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			adoptSnapshot(dispatch, await request("session:setMessages", { sessionId, messages }), {
				rewriteTranscript: true,
			});
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

export function compactNow(customInstructions?: string): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		try {
			const result = await request("session:compact", {
				sessionId,
				...(customInstructions ? { customInstructions } : {}),
			});
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
			adoptSnapshot(dispatch, await request("session:configure", { sessionId, patch }));
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
			adoptSnapshot(dispatch, await request("session:configure", { sessionId, patch }));
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
			adoptSnapshot(
				dispatch,
				await request("session:runSkill", {
					sessionId,
					name,
					...(additionalInstructions ? { additionalInstructions } : {}),
				}),
			);
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
			adoptSnapshot(dispatch, await request("session:runTemplate", { sessionId, name, args }));
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
			dispatch(sessionActions.resourcesReceived(await request("session:reloadResources", sessionId)));
		} catch (error) {
			reportError(dispatch, error);
		}
	};
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function decideApproval(approvalId: string, decision: ToolApprovalDecision): AppThunk<Promise<void>> {
	return async (dispatch, getState) => {
		const sessionId = getState().session.sessionId;
		if (!sessionId) return;
		dispatch(approvalsActions.deciding(approvalId));
		try {
			adoptSnapshot(dispatch, await request("tool:approve", { sessionId, approvalId, decision }));
		} catch (error) {
			// Another window may have answered first; drop it either way.
			dispatch(approvalsActions.resolved(approvalId));
			reportError(dispatch, error);
		}
	};
}
