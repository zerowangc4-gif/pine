/**
 * Desktop Redux glue: subscribe to sidecar events and dispatch into slices.
 *
 * Does not define wire semantics — those comments are on
 * `@pine/socket-client` `subscribe.ts` / `send.ts`.
 * Each handler below only documents the Redux/UI effect.
 */

import type { Store } from "@reduxjs/toolkit";
import type { RootState } from "../store/index.ts";
import { approvalsActions } from "../store/slices/approvals.ts";
import { configActions } from "../store/slices/config.ts";
import { connectionActions } from "../store/slices/connection.ts";
import { debugActions } from "../store/slices/debug.ts";
import { sessionActions } from "../store/slices/session.ts";
import { transcriptActions } from "../store/slices/transcript.ts";
import { pine } from "./instance.ts";

/**
 * Bind transport + subscriptions into Redux and open the connection.
 * Called once at start-up; returns teardown for HMR.
 */
export function attachSubscribe(store: Store<RootState>): () => void {
	const { dispatch } = store;

	/** Drop events that belong to a session this window is no longer showing. */
	const belongsToSession = (sessionId: string | undefined): boolean => {
		const current = store.getState().session.sessionId;
		if (!current || !sessionId) return true;
		return sessionId === current;
	};

	// --- transport → connection slice --------------------------------------

	pine.bindTransport({
		/** Socket connected (or recovered); clear transport error. */
		onConnect: ({ recovered }) => {
			dispatch(connectionActions.connected({ recovered }));
		},
		/** Socket dropped; mark disconnected and freeze any half-streamed message. */
		onDisconnect: (reason) => {
			dispatch(connectionActions.disconnected(reason));
			dispatch(transcriptActions.streamInterrupted());
		},
		/** Handshake failed; store error text for the top bar. */
		onConnectError: (message) => {
			dispatch(connectionActions.connectFailed(message));
		},
	});

	// --- protocol subscribe → slices ---------------------------------------

	/** Sidecar ready: store runtime info and bump readyEpoch (reattach session). */
	pine.subscribe.onReady((info) => {
		dispatch(connectionActions.ready(info));
	});

	/** Stream agent lifecycle into the transcript (+ debug event log). */
	pine.subscribe.onAgentEvent(({ sessionId, seq, event }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(debugActions.eventObserved({ seq, type: event.type }));
		dispatch(transcriptActions.applyEvent(event));
	});

	/** Full snapshot: session state, pending approvals, authoritative config. */
	pine.subscribe.onSessionState((snapshot) => {
		if (!belongsToSession(snapshot.sessionId)) return;
		dispatch(sessionActions.snapshotReceived(snapshot));
		dispatch(approvalsActions.replaceAll(snapshot.pendingApprovals));
		dispatch(configActions.serverConfirmed(snapshot.config));
	});

	/** Run finished: clear running flag; surface stop reason / error in transcript. */
	pine.subscribe.onSessionRunEnd(({ sessionId, stopReason, errorMessage }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(sessionActions.runEnded());
		if (errorMessage) dispatch(transcriptActions.notice({ level: "error", text: errorMessage }));
		if (stopReason) dispatch(transcriptActions.stopped(stopReason));
	});

	/** Skills/templates catalog updated. */
	pine.subscribe.onSessionResources(({ sessionId, resources }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(sessionActions.resourcesReceived(resources));
	});

	/** Compaction finished; show a compaction notice in the transcript. */
	pine.subscribe.onSessionCompacted(({ sessionId, compaction, automatic }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.compacted({ compaction, automatic }));
	});

	/** Deferred config applied at turn boundary; show what changed. */
	pine.subscribe.onSessionTurnPrepared(({ sessionId, changes }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.turnPrepared(changes));
	});

	/** Workspace root changed; show path as an info notice. */
	pine.subscribe.onSessionWorkspace(({ sessionId, workspace }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.notice({ level: "info", text: workspace }));
	});

	/** Session closed remotely; clear session, transcript, and approvals. */
	pine.subscribe.onSessionClosed(({ sessionId }) => {
		if (store.getState().session.sessionId !== sessionId) return;
		dispatch(sessionActions.closed(sessionId));
		dispatch(transcriptActions.clear());
		dispatch(approvalsActions.clear());
	});

	/** Tool needs user approval; show the approval bar. */
	pine.subscribe.onToolApprovalRequest(({ sessionId, request: approval }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(approvalsActions.requested(approval));
	});

	/** Approval answered (this or another window); remove from pending. */
	pine.subscribe.onToolApprovalResolved(({ sessionId, approvalId }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(approvalsActions.resolved(approvalId));
	});

	/** Tool result was truncated/adjusted; show reason as a notice. */
	pine.subscribe.onToolResultAdjusted(({ sessionId, reason }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.notice({ level: "info", text: reason }));
	});

	/** Provider request payload for the debug inspector. */
	pine.subscribe.onDebugPayload(({ sessionId, seq, payload }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(debugActions.payloadObserved({ seq, direction: "request", body: payload }));
	});

	/** Provider response headers/status for the debug inspector. */
	pine.subscribe.onDebugResponse(({ sessionId, seq, status, headers }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(debugActions.payloadObserved({ seq, direction: "response", body: { status, headers } }));
	});

	/** Sidecar log line; show as a transcript notice. */
	pine.subscribe.onLog(({ sessionId, level, message }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.notice({ level, text: message }));
	});

	dispatch(connectionActions.connecting());
	pine.connect();

	return () => pine.dispose();
}
