/**
 * Translates socket broadcasts into store actions.
 *
 * This is the only place that knows both vocabularies. Every listener is a
 * one-liner: no business logic lives here, so a new server event costs one
 * line plus a reducer.
 *
 * Broadcasts are room scoped, but a socket can briefly be in two rooms while
 * switching sessions, so `belongsToSession` drops anything from a session this
 * window has already left.
 */

import type { Store } from "@reduxjs/toolkit";
import type { RootState } from "../store/index.ts";
import { approvalsActions } from "../store/slices/approvals.ts";
import { configActions } from "../store/slices/config.ts";
import { connectionActions } from "../store/slices/connection.ts";
import { debugActions } from "../store/slices/debug.ts";
import { sessionActions } from "../store/slices/session.ts";
import { transcriptActions } from "../store/slices/transcript.ts";
import { describeSocketError, socket } from "./client.ts";

/**
 * Attach every listener and open the connection.
 *
 * Called once at start-up. Returns a teardown for hot-module reloads, so a
 * dev-server refresh does not stack duplicate listeners on the same socket.
 */
export function attachSocket(store: Store<RootState>): () => void {
	const { dispatch } = store;

	/**
	 * True when a payload concerns the session this window is showing.
	 *
	 * Before the first session opens there is nothing to filter against, so
	 * everything is accepted — that is how the log lines emitted while a session
	 * is still being created reach the transcript.
	 */
	const belongsToSession = (sessionId: string | undefined): boolean => {
		const current = store.getState().session.sessionId;
		if (!current || !sessionId) return true;
		return sessionId === current;
	};

	// --- transport lifecycle -----------------------------------------------

	socket.on("connect", () => {
		// `recovered` means Socket.IO replayed the missed packets and restored the
		// rooms; the app can skip its own reattach in that case.
		dispatch(connectionActions.connected({ recovered: socket.recovered }));
	});

	socket.on("disconnect", (reason) => {
		dispatch(connectionActions.disconnected(reason));
		// A half-streamed assistant message must not be left looking settled.
		dispatch(transcriptActions.streamInterrupted());
	});

	socket.on("connect_error", (error) => {
		dispatch(connectionActions.connectFailed(describeSocketError(error)));
	});

	socket.on("ready", (info) => {
		dispatch(connectionActions.ready(info));
	});

	// --- session ------------------------------------------------------------

	socket.on("agent:event", ({ sessionId, seq, event }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(debugActions.eventObserved({ seq, type: event.type }));
		dispatch(transcriptActions.applyEvent(event));
	});

	socket.on("session:state", (snapshot) => {
		if (!belongsToSession(snapshot.sessionId)) return;
		dispatch(sessionActions.snapshotReceived(snapshot));
		dispatch(approvalsActions.replaceAll(snapshot.pendingApprovals));
		// The server clamps some fields, so its copy of the config is the truth.
		dispatch(configActions.serverConfirmed(snapshot.config));
	});

	socket.on("session:runEnd", ({ sessionId, stopReason, errorMessage }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(sessionActions.runEnded());
		if (errorMessage) dispatch(transcriptActions.notice({ level: "error", text: errorMessage }));
		if (stopReason) dispatch(transcriptActions.stopped(stopReason));
	});

	socket.on("session:resources", ({ sessionId, resources }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(sessionActions.resourcesReceived(resources));
	});

	socket.on("session:compacted", ({ sessionId, compaction, automatic }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.compacted({ compaction, automatic }));
	});

	socket.on("session:turnPrepared", ({ sessionId, changes }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.turnPrepared(changes));
	});

	socket.on("session:workspace", ({ sessionId, workspace }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.notice({ level: "info", text: workspace }));
	});

	socket.on("session:closed", ({ sessionId }) => {
		if (store.getState().session.sessionId !== sessionId) return;
		dispatch(sessionActions.closed(sessionId));
		dispatch(transcriptActions.clear());
		dispatch(approvalsActions.clear());
	});

	// --- tools --------------------------------------------------------------

	socket.on("tool:approvalRequest", ({ sessionId, request }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(approvalsActions.requested(request));
	});

	socket.on("tool:approvalResolved", ({ sessionId, approvalId }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(approvalsActions.resolved(approvalId));
	});

	socket.on("tool:resultAdjusted", ({ sessionId, reason }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.notice({ level: "info", text: reason }));
	});

	// --- diagnostics --------------------------------------------------------

	socket.on("debug:payload", ({ sessionId, seq, payload }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(debugActions.payloadObserved({ seq, direction: "request", body: payload }));
	});

	socket.on("debug:response", ({ sessionId, seq, status, headers }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(debugActions.payloadObserved({ seq, direction: "response", body: { status, headers } }));
	});

	socket.on("log", ({ sessionId, level, message }) => {
		if (!belongsToSession(sessionId)) return;
		dispatch(transcriptActions.notice({ level, text: message }));
	});

	dispatch(connectionActions.connecting());
	socket.connect();

	return () => {
		socket.removeAllListeners();
		socket.disconnect();
	};
}
