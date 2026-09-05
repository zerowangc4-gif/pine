/**
 * Owns the live `AgentSession` instances and their Socket.IO rooms.
 *
 * Sessions deliberately outlive socket connections. A UI reload, a dropped
 * network or a Tauri window restart must not kill a run that is streaming, so
 * a reconnecting client reattaches by id and picks the conversation back up
 * from a fresh snapshot.
 *
 * Room pushes use `socket/subscribe.ts` `createRoomSubscribe` (named `subscribe.*`).
 */

import { uuidv7 } from "@pine/agent";
import type { OpenSessionRequest, SessionOpened } from "@pine/protocol";
import { sessionRoom } from "@pine/protocol";
import type { SessionStore } from "../domain/persistence.ts";
import type { RuntimeServer, RuntimeSocket } from "../socket/instance.ts";
import { createRoomSubscribe } from "../socket/subscribe.ts";
import { AgentSession } from "./session.ts";

export class SessionHub {
	private readonly sessions = new Map<string, AgentSession>();
	private readonly io: RuntimeServer;
	private readonly store: SessionStore;
	private readonly baseDir: string;

	constructor(io: RuntimeServer, store: SessionStore, baseDir: string) {
		this.io = io;
		this.store = store;
		this.baseDir = baseDir;
	}

	/** Ids of sessions running right now, so a fresh window can offer to adopt one. */
	liveIds(): string[] {
		return [...this.sessions.keys()];
	}

	/** Resolve a session or throw a message the UI can show verbatim. */
	require(sessionId: string): AgentSession {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error(`Unknown session: ${sessionId}`);
		return session;
	}

	/**
	 * Attach a socket to a session, creating or resuming one as needed.
	 *
	 * Three cases, in order of preference:
	 *  1. the requested session is already live -> reattach, keep its run going
	 *  2. an id was given but is not live -> resume from its stored transcript
	 *  3. no id -> create a new session
	 */
	async open(socket: RuntimeSocket, request: OpenSessionRequest): Promise<SessionOpened> {
		const requestedId = request.resumeSessionId?.trim();

		if (requestedId) {
			const existing = this.sessions.get(requestedId);
			if (existing) {
				await socket.join(sessionRoom(requestedId));
				return { state: existing.snapshot(), resources: existing.resources(), reattached: true };
			}
		}

		const id = requestedId || uuidv7();
		const session = await AgentSession.create({
			id,
			config: request.config,
			store: this.store,
			baseDir: this.baseDir,
			...(requestedId ? { resumeSessionId: requestedId } : {}),
			subscribe: createRoomSubscribe(this.io, id),
		});

		this.sessions.set(id, session);
		await socket.join(sessionRoom(id));
		return { state: session.snapshot(), resources: session.resources(), reattached: false };
	}

	async close(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		this.sessions.delete(sessionId);
		await session.close();

		/** Emit `session:closed` → client `subscribe.onSessionClosed`. */
		createRoomSubscribe(this.io, sessionId).sessionClosed({ sessionId });
		this.io.socketsLeave(sessionRoom(sessionId));
	}

	/** Called on process shutdown; aborts runs and flushes transcripts. */
	async closeAll(): Promise<void> {
		await Promise.allSettled([...this.sessions.keys()].map((id) => this.close(id)));
	}
}
